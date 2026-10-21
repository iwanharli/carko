// Form tambah/edit kost dibuka dari halaman mana pun: bukaForm(kost?) → Promise<kost tersimpan | null>
export const formState = $state({ buka: false, kost: null, resolve: null });

export function bukaForm(kost = null) {
  return new Promise(resolve => Object.assign(formState, { buka: true, kost, resolve }));
}
