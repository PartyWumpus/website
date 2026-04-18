#!/usr/bin/env bash

cd WCBE
nix develop .# --command wasm-pack build --target web
