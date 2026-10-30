/** Файлы: сохранение и открытие проекта (JSON), выгрузка картинок. */

export function download(filename, dataUrlOrBlob) {
  const a = document.createElement('a');
  const url = typeof dataUrlOrBlob === 'string' ? dataUrlOrBlob : URL.createObjectURL(dataUrlOrBlob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof dataUrlOrBlob !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeName(name) {
  return (name || 'проект').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'проект';
}

export function saveProjectFile(project) {
  const blob = new Blob([JSON.stringify(project, null, 1)], { type: 'application/json' });
  download(`${safeName(project.name)}.houseplan.json`, blob);
}

/** Диалог выбора файла; возвращает разобранный JSON или null. */
export function pickProjectFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(JSON.parse(await file.text()));
      } catch (err) {
        reject(new Error('Файл не похож на проект HousePlan (ошибка JSON)'));
      }
    });
    input.click();
  });
}
