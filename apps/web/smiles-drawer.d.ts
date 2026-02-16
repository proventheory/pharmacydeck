declare module "smiles-drawer" {
  const SmilesDrawer: {
    parse: (smiles: string, onSuccess: (tree: unknown) => void, onError?: (err: Error) => void) => void;
    Drawer: new (opts: Record<string, unknown>) => {
      draw: (tree: unknown, id: string, theme: string, highlight: boolean) => void;
    };
  };
  export default SmilesDrawer;
}
