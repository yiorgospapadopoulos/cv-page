interface CanvasLike {
  getContext(kind: string): unknown;
}

export interface DocumentLike {
  createElement(tag: 'canvas'): CanvasLike;
}

export function supportsWebGL(doc: DocumentLike): boolean {
  try {
    const canvas = doc.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  } catch {
    return false;
  }
}

export function shouldRender3D(env: {
  webgl: boolean;
  reducedMotion: boolean;
}): boolean {
  return env.webgl && !env.reducedMotion;
}
