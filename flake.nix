{
  description = "LLM RAG Translator: development shell (dendritic flake-parts layout)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    import-tree.url = "github:vic/import-tree";
  };

  # Dendritic pattern: every file under ./modules is a flake-parts module, loaded automatically.
  # To add a feature, drop a file in modules/; never edit this file.
  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } (inputs.import-tree ./modules);
}
