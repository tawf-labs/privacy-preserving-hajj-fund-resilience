# Structured reference string (public parameters)

Verifying an UltraHONK proof over BN254 needs only the G2 point `[x]_2` and the first G1 points of the
universal SRS. These files are the first 16 G1 points (`bn254_g1_first16.dat`, 64 B each, uncompressed) and the
G2 point (`bn254_g2.dat`, 128 B) of the Aztec Ignition ceremony transcript, fetched with `scripts/setup-crs.sh`
from `aztec-ignition.s3.amazonaws.com/MAIN IGNITION/flat/`.

They are public parameters, not secrets. Shipping them lets the portal verify proofs in the browser without
downloading the ~20 MB the full proving SRS would need.
