// A history entry includes the question being answered and the selected room.
export function historyRecord(value) {
  const shape = value.shape ? { count: value.shape.count, walls: value.shape.walls, angles: value.shape.angles,
    clockwise: value.shape.clockwise, thickness: value.shape.thickness } : null;
  return JSON.stringify({
    package: value.package, entrance: value.entrance, shape, pendingShape: value.pendingShape,
    openingAnchors: value.openingAnchors, screen: value.screen, currentRoomIndex: value.currentRoomIndex,
    pendingAdjacent: value.pendingAdjacent, openingStep: value.openingStep, interiorStep: value.interiorStep,
    balconyStep: value.balconyStep, wallFix: value.wallFix, activeRoomWall: value.activeRoomWall,
    voicePromptOpen: value.voicePromptOpen, voicePromptId: value.voicePromptId,
    editingOpeningId: value.editingOpeningId,
    editingInteriorId: value.editingInteriorId, openingPlacementActive: value.openingPlacementActive,
    form: value.form,
  });
}

export function updateZoomView(view, previous, current, centre, size) {
  const factor = previous.spread > 0 && current.spread > 0 ? current.spread / previous.spread : 1;
  const zoom = Math.min(6, Math.max(1, view.zoom * factor));
  const applied = zoom / view.zoom;
  const limitX = (zoom - 1) * size[0] / 2;
  const limitY = (zoom - 1) * size[1] / 2;
  const x = current.mid[0] - centre[0] - (previous.mid[0] - centre[0] - view.x) * applied;
  const y = current.mid[1] - centre[1] - (previous.mid[1] - centre[1] - view.y) * applied;
  return {
    zoom,
    x: Math.max(-limitX, Math.min(limitX, x)),
    y: Math.max(-limitY, Math.min(limitY, y)),
  };
}
