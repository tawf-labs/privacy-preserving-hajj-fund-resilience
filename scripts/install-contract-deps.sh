#!/usr/bin/env bash
# Fetches the Solidity dependencies into contracts/lib (kept out of git, like a forge install).
set -euo pipefail
cd "$(dirname "$0")/../contracts"
mkdir -p lib && cd lib
clone() { [ -d "$2" ] || GIT_LFS_SKIP_SMUDGE=1 git clone -q --depth 1 --branch "$3" "https://github.com/$1/$2" "$2"; }
clone OpenZeppelin openzeppelin-contracts v5.4.0
clone foundry-rs forge-std v1.9.7
echo "contract deps ready in $(pwd)"
