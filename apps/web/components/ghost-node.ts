import {
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
} from "lexical";

/**
 * One muted continuation in the composer. `getTextContent` is empty so the
 * draft the form posts — and Lexical's own text — cannot keep unaccepted ghost
 * as a Thread message.
 */
export class GhostNode extends TextNode {
  static getType(): string {
    return "ghost";
  }

  static clone(node: GhostNode): GhostNode {
    return new GhostNode(node.__text, node.__key);
  }

  constructor(text: string, key?: NodeKey) {
    super(text, key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    const themeClass = config.theme.ghost;
    dom.className = typeof themeClass === "string" ? themeClass : "text-muted-foreground";
    dom.setAttribute("aria-hidden", "true");
    return dom;
  }

  getTextContent(): string {
    return "";
  }

  continuation(): string {
    return this.__text;
  }

  static importJSON(serialized: SerializedTextNode): GhostNode {
    return $createGhostNode(serialized.text);
  }

  exportJSON(): SerializedTextNode {
    return { ...super.exportJSON(), type: "ghost" };
  }
}

export function $createGhostNode(text: string): GhostNode {
  const node = new GhostNode(text);
  node.setMode("token").toggleUnmergeable();
  return node;
}

export function $isGhostNode(node: LexicalNode | null | undefined): node is GhostNode {
  return node instanceof GhostNode;
}
