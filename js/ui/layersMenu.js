/** Меню «Слои»: мебель, электрика, сантехника, отопление — на плане и в 3D. */
import { openMenu } from './ContextMenu.js';
import { LAYERS, layerVisible } from '../model/layers.js';

export function layerItems(app) {
  const st = app.state;
  return LAYERS.map(([key, label, ic]) => ({
    label,
    icon: ic,
    toggle: true,
    active: layerVisible(st.settings, key),
    onClick: (on) => st.setSetting(`layer_${key}`, on),
  }));
}

export function openLayersMenu(app, anchor) {
  openMenu(app, { anchor, align: 'right', sheet: app.state.isPhone, title: 'Слои плана и 3D', items: layerItems(app) });
}
