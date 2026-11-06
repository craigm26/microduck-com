// The story book's one figure: the cut sheets of a spread. Each sheet is two
// half planes, one on each page, hinged at the foot of what it shows. Lying flat
// it sits exactly where it sits in the picture; rising, it stands up off the room
// like a sheet in a toy theatre. Every word stays in the document, on top of this.

function half(ctx, sheet, j, side) {
  const { THREE } = ctx;
  const sp = ctx.spread;
  const W = sp.art.w / 2, H = sp.art.h, foot = sheet.foot;
  const crop = (H - ctx.page.h) / 2;
  const top = foot * H - crop, bottom = -(1 - foot) * H + crop;
  const g = new THREE.BufferGeometry();
  const u0 = side < 0 ? 0 : 0.5, u1 = u0 + 0.5, v0 = crop / H, v1 = 1 - crop / H;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-W / 2, top, 0, W / 2, top, 0, -W / 2, bottom, 0, W / 2, bottom, 0]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([u0, v1, u1, v1, u0, v0, u1, v0]), 2));
  g.setIndex([0, 2, 1, 2, 3, 1]);
  g.computeVertexNormals();
  const entry = sp.tex(`${sp.base}-${sheet.name}.webp`);
  // alphaTest also cuts the shadow to the shape, since three copies it to the shadow pass
  const mat = new THREE.MeshLambertMaterial({ map: entry.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.03 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.renderOrder = 2 + j;
  mesh.position.set(-side * sp.gut / 2, 0.8 + j * 0.5, (foot - 0.5) * H);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  (side < 0 ? sp.left : sp.right).add(mesh);
  return mesh;
}

export const figures = {
  spread(ctx) {
    const { K } = ctx;
    const n = ctx.spread.sheets.length;
    const parts = ctx.spread.sheets.map((sheet, j) => ({ sheet, j, meshes: [half(ctx, sheet, j, -1), half(ctx, sheet, j, 1)] }));
    return {
      group: ctx.group, steps: [],
      reset() {},
      show(on) { for (const p of parts) for (const m of p.meshes) m.visible = on; },
      pop(u, rising) {
        for (const p of parts) {
          const lag = n > 1 ? (p.j / (n - 1)) * 0.3 : 0;
          const v = K.clamp((u - lag) / (1 - lag + 1e-6));
          const a = (rising ? K.ease.back(v) : v) * p.sheet.rise * Math.PI / 180;
          for (const m of p.meshes) m.rotation.x = -Math.PI / 2 + a;
        }
      },
      dispose() {
        for (const p of parts) for (const m of p.meshes) {
          m.removeFromParent();
          m.geometry.dispose();
          m.material.dispose();
        }
      },
    };
  },
};
