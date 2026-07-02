# NixOS: pip wheels (numpy, onnxruntime via chromadb) link against libstdc++ and
# friends that aren't on the default library path. Enter this shell before using
# the .venv so those .so files resolve.
#
#   nix-shell
#   source .venv/bin/activate
#   python -m translate_manual.cli translate ...
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  buildInputs = [ pkgs.python313 ];

  # Covers libstdc++.so.6 + libgomp (stdenv.cc.cc.lib), zlib, and glib —
  # enough for numpy and chromadb's onnxruntime embedder.
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
    pkgs.stdenv.cc.cc.lib
    pkgs.zlib
    pkgs.glib
  ];
}
