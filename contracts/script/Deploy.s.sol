// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HonkVerifier} from "../src/HonkVerifier.sol";
import {HajjSolvencyRegistry} from "../src/HajjSolvencyRegistry.sol";

/// Deploys the UltraHONK verifier and the solvency registry (Ethereum Sepolia).
///
///   export SEPOLIA_RPC_URL=... DEPLOYER_PRIVATE_KEY=...
///   export REGULATOR_ADDRESS=0x...   # pins period parameters (e.g. OJK / Sharia board multisig)
///   export PROVER_ADDRESS=0x...      # the fund's submitter (BPKH)
///   export ADMIN_ADDRESS=0x...       # optional, defaults to the deployer
///   bash ../scripts/forge.sh script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);
        address regulator = vm.envAddress("REGULATOR_ADDRESS");
        address prover = vm.envAddress("PROVER_ADDRESS");

        vm.startBroadcast(pk);
        HonkVerifier verifier = new HonkVerifier();
        HajjSolvencyRegistry registry = new HajjSolvencyRegistry(address(verifier), admin, regulator, prover);
        vm.stopBroadcast();

        console.log("HonkVerifier          ", address(verifier));
        console.log("HajjSolvencyRegistry  ", address(registry));
    }
}
