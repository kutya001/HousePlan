/** Диалог пресетов: готовые дома и коробки, размеры участка. */
import { h, icon } from './dom.js';
import { openModal } from './feedback.js';
import { HOUSE_PRESETS, SITE_PRESETS, buildHousePreset } from '../model/presets.js';
import { drawPlanPreview } from './planPreview.js';

export class PresetsDialog {
  constructor(app) {
    this.app = app;
  }

  open(tab = 'houses') {
    const app = this.app;
    let modal;
    const housesPane = h('div', { class: 'preset-grid' });
    for (const p of HOUSE_PRESETS) {
      const canvas = h('canvas', { class: 'preset-thumb', 'aria-hidden': 'true' });
      const values = {};
      const params = (p.params || []).map((prm) => {
        values[prm.key] = prm.value;
        return h(
          'label',
          { class: 'preset-param' },
          h('span', {}, prm.label),
          h('input', {
            type: 'number',
            value: prm.value,
            min: prm.min,
            max: prm.max,
            step: prm.step,
            oninput: (e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) {
                values[prm.key] = Math.min(prm.max, Math.max(prm.min, v));
                drawPlanPreview(canvas, buildHousePreset(p.id, values));
              }
            },
          }),
        );
      });
      const card = h(
        'article',
        { class: 'preset-card' },
        canvas,
        h('div', { class: 'preset-info' }, h('h3', {}, p.name), h('p', {}, p.description), params.length ? h('div', { class: 'preset-params' }, params) : null),
        h(
          'button',
          {
            class: 'btn btn-primary btn-block',
            onclick: async () => {
              modal.close();
              await app.commands.applyHousePreset(p.id, values);
            },
          },
          'Создать',
        ),
      );
      housesPane.append(card);
      requestAnimationFrame(() => drawPlanPreview(canvas, buildHousePreset(p.id, values)));
    }

    const sitePane = h(
      'div',
      { class: 'site-presets' },
      h('p', { class: 'muted' }, 'Участок встанет по центру дома. Форму можно потом поправить инструментом «Участок» или ручками по углам.'),
      h(
        'div',
        { class: 'site-grid' },
        SITE_PRESETS.map((s) =>
          h(
            'button',
            {
              class: 'site-card',
              onclick: () => {
                modal.close();
                app.editor.tools.site.applyPreset(s);
              },
            },
            h('span', { class: 'site-name' }, s.name),
            h('span', { class: 'site-dims' }, `${s.w} × ${s.d} м`),
          ),
        ),
      ),
    );

    const tabs = h('div', { class: 'seg modal-tabs', role: 'tablist' });
    const panes = { houses: housesPane, site: sitePane };
    const show = (id) => {
      for (const [k, el] of Object.entries(panes)) el.hidden = k !== id;
      for (const b of tabs.children) b.classList.toggle('active', b.dataset.tab === id);
    };
    for (const [id, label, ic] of [
      ['houses', 'Дома и коробки', 'box'],
      ['site', 'Размер участка', 'site'],
    ]) {
      tabs.append(h('button', { class: 'seg-btn', dataset: { tab: id }, onclick: () => show(id) }, icon(ic, 18), label));
    }
    const content = h('div', {}, tabs, housesPane, sitePane);
    show(tab);
    modal = openModal(app, { title: 'Пресеты', content, wide: true });
  }
}
