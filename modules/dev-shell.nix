# `nix develop` (or direnv, with `direnv allow`) gives every contributor the toolchains CI uses.
{
  perSystem =
    { pkgs, lib, ... }:
    {
      devShells.default = pkgs.mkShell {
        packages = with pkgs; [
          git
          gh
          jq
          (python313.withPackages (ps: [ ps.pytest ]))
          ruff
          uv
          # spec-review scripts and `openspec` run on Node (type stripping needs 24+)
          nodejs_24
        ];

        # NixOS: pip wheels (numpy, onnxruntime via chromadb) link against libstdc++ and friends
        # that are not on the default library path. Replaces the old shell.nix.
        LD_LIBRARY_PATH = lib.makeLibraryPath [
          pkgs.stdenv.cc.cc.lib
          pkgs.zlib
          pkgs.glib
        ];
      };
    };
}
