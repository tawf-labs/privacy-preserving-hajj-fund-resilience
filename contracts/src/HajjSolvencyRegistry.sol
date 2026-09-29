// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/**
 * @title HajjSolvencyRegistry
 * @notice Layer 4: public, append-only record of zero-knowledge solvency proofs for the
 *         Hajj fund. A notary, not a custodian: it holds no funds, has no payable
 *         entrypoint, and can at worst stop new proofs being recorded.
 *
 * Trust split:
 *   REGULATOR_ROLE  pins, per period, the public parameters (macro assumptions, stress
 *                   regimes, threshold tau) and the accepted attestor key hash. A prover
 *                   therefore cannot pick easier scenarios or a different attestor.
 *   PROVER_ROLE     (the fund) submits a proof for a pinned period. The proof is only
 *                   accepted if its public inputs equal the pinned parameters exactly.
 *   Anyone          reads results and can re-verify any stored proof.
 *
 * Public input layout (must match packages/prover/src/encoding.ts PUBLIC_INPUT_LAYOUT):
 *   [0]      period_id
 *   [1..4]   fx_base, quota, sar_share_bps, tau_bps
 *   [5..7]   inflation_bps[3]     [8..10]  fx_idr_per_sar[3]
 *   [11..13] discount_bps[3]      [14..16] yield_shock_bps[3]
 *   [17..34] haircut_bps[3][6]
 *   [35]     attestor_key_hash
 *   [36..38] result_bits[3]       (outputs: 1 iff SR_s >= tau)
 *   [39]     statement_id         (replay nullifier)
 *   [40]     commitment           (hiding commitment to the private witness)
 */
contract HajjSolvencyRegistry is AccessControl {
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant PROVER_ROLE = keccak256("PROVER_ROLE");

    uint256 public constant N_SCENARIOS = 3;
    uint256 public constant PARAM_COUNT = 36;
    uint256 public constant RESULT_OFFSET = 36;
    uint256 public constant PUBLIC_INPUT_COUNT = 41;
    uint256 public constant PERIOD_INDEX = 0;

    struct PeriodParams {
        bytes32 paramsHash; // keccak256 of the pinned public parameter words
        bool pinned;
    }

    struct Record {
        uint64 submittedAt;
        uint64 blockNumber;
        bool[3] pass;
        bytes32 statementId;
        bytes32 commitment;
        bytes32 proofHash;
        address submitter;
    }

    IHonkVerifier public immutable verifier;

    mapping(uint256 periodId => PeriodParams) public periods;
    mapping(uint256 periodId => Record) private _records;
    mapping(uint256 periodId => bool) public hasRecord;
    mapping(bytes32 statementId => bool) public statementUsed;
    mapping(bytes32 proofHash => bool) public proofUsed;
    uint256[] private _submittedPeriods;

    event PeriodPinned(uint256 indexed periodId, bytes32 paramsHash);
    event SolvencyVerified(
        uint256 indexed periodId,
        bool baseline,
        bool moderate,
        bool acute,
        bytes32 statementId,
        bytes32 commitment,
        address submitter
    );

    error PeriodAlreadyPinned(uint256 periodId);
    error PeriodNotPinned(uint256 periodId);
    error PeriodAlreadySubmitted(uint256 periodId);
    error WrongPublicInputCount(uint256 got);
    error ParamsMismatch(uint256 periodId);
    error BadParamCount(uint256 got);
    error StatementReplayed(bytes32 statementId);
    error ProofReplayed(bytes32 proofHash);
    error InvalidProof();
    error NonBooleanResult(uint256 index);
    error NoRecord(uint256 periodId);

    constructor(address verifier_, address admin, address regulator, address prover) {
        verifier = IHonkVerifier(verifier_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGULATOR_ROLE, regulator);
        _grantRole(PROVER_ROLE, prover);
    }

    /// @notice Pins the public parameters for a period. Immutable once set.
    /// @param params The first PARAM_COUNT public inputs, in circuit order (period id first).
    function pinPeriod(bytes32[] calldata params) external onlyRole(REGULATOR_ROLE) {
        if (params.length != PARAM_COUNT) revert BadParamCount(params.length);
        uint256 periodId = uint256(params[PERIOD_INDEX]);
        if (periods[periodId].pinned) revert PeriodAlreadyPinned(periodId);
        bytes32 h = keccak256(abi.encodePacked(params));
        periods[periodId] = PeriodParams({paramsHash: h, pinned: true});
        emit PeriodPinned(periodId, h);
    }

    /// @notice Records a verified solvency proof for a pinned period. One proof per period.
    function submitProof(bytes calldata proof, bytes32[] calldata publicInputs) external onlyRole(PROVER_ROLE) {
        if (publicInputs.length != PUBLIC_INPUT_COUNT) revert WrongPublicInputCount(publicInputs.length);

        uint256 periodId = uint256(publicInputs[PERIOD_INDEX]);
        PeriodParams memory p = periods[periodId];
        if (!p.pinned) revert PeriodNotPinned(periodId);
        if (hasRecord[periodId]) revert PeriodAlreadySubmitted(periodId);
        if (keccak256(abi.encodePacked(publicInputs[0:PARAM_COUNT])) != p.paramsHash) revert ParamsMismatch(periodId);

        bool[3] memory pass;
        for (uint256 i = 0; i < N_SCENARIOS; i++) {
            uint256 bit = uint256(publicInputs[RESULT_OFFSET + i]);
            if (bit > 1) revert NonBooleanResult(i);
            pass[i] = bit == 1;
        }

        bytes32 statementId = publicInputs[RESULT_OFFSET + N_SCENARIOS];
        bytes32 commitment = publicInputs[RESULT_OFFSET + N_SCENARIOS + 1];
        bytes32 proofHash = keccak256(proof);
        if (statementUsed[statementId]) revert StatementReplayed(statementId);
        if (proofUsed[proofHash]) revert ProofReplayed(proofHash);

        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        statementUsed[statementId] = true;
        proofUsed[proofHash] = true;
        hasRecord[periodId] = true;
        _submittedPeriods.push(periodId);
        _records[periodId] = Record({
            submittedAt: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            pass: pass,
            statementId: statementId,
            commitment: commitment,
            proofHash: proofHash,
            submitter: msg.sender
        });

        emit SolvencyVerified(periodId, pass[0], pass[1], pass[2], statementId, commitment, msg.sender);
    }

    /// @notice Anyone can re-verify a proof against the pinned parameters (no state change).
    function verifyProof(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (publicInputs.length != PUBLIC_INPUT_COUNT) return false;
        PeriodParams memory p = periods[uint256(publicInputs[PERIOD_INDEX])];
        if (!p.pinned || keccak256(abi.encodePacked(publicInputs[0:PARAM_COUNT])) != p.paramsHash) return false;
        return verifier.verify(proof, publicInputs);
    }

    function getRecord(uint256 periodId) external view returns (Record memory) {
        if (!hasRecord[periodId]) revert NoRecord(periodId);
        return _records[periodId];
    }

    function submittedPeriods() external view returns (uint256[] memory) {
        return _submittedPeriods;
    }

    function submittedCount() external view returns (uint256) {
        return _submittedPeriods.length;
    }
}
