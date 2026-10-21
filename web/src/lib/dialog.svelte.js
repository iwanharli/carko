// Modal pengganti alert/confirm/prompt dan toast. Dirender oleh <DialogHost /> di layout.
//   konfirmasi → true / false, isian → teks / null (batal), info → true

export const dialog = $state({ aktif: null });
export const toastState = $state({ pesan: '', undo: null, id: 0 });

function buka(opsi) {
  return new Promise(resolve => { dialog.aktif = { ok: 'OK', batal: 'Batal', ikon: 'info', pilihanCepat: [], ...opsi, resolve }; });
}
export const info = opsi => buka({ jenis: 'info', ...opsi });
export const konfirmasi = opsi => buka({ jenis: 'konfirmasi', ...opsi });
export const isian = opsi => buka({ jenis: 'isian', ...opsi });

let timer;
export function toast(pesan, undo = null) {
  Object.assign(toastState, { pesan, undo, id: toastState.id + 1 });
  clearTimeout(timer);
  timer = setTimeout(() => (toastState.pesan = ''), 6000);
}
