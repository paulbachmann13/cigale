/** Sélecteur de fichiers : API « File System Access » si disponible (Chrome, Edge), sinon <input type=file>. */
export interface PickedFile {
  file: File;
  handle?: FileSystemFileHandle;
}

type Picker = (opts: unknown) => Promise<FileSystemFileHandle[]>;

export async function pickPdfs(input: HTMLInputElement): Promise<PickedFile[]> {
  const picker = (window as unknown as { showOpenFilePicker?: Picker }).showOpenFilePicker;
  if (picker) {
    try {
      const handles = await picker({ multiple: true, types: [{ description: 'Documents PDF', accept: { 'application/pdf': ['.pdf'] } }] });
      return await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return [];
      /* sélecteur indisponible ou refusé : repli sur <input> */
    }
  }
  // Repli : le champ de fichier ouvre le sélecteur ; l'application écoute son événement « change ».
  input.value = '';
  input.click();
  return [];
}

/** Fichiers déposés ; récupère aussi les « handles » quand le navigateur les fournit. */
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  type WithHandle = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === 'file') as WithHandle[];
  // Les « handles » doivent être demandés tout de suite : la liste des éléments se vide après le premier await.
  const pending = items.map((item) => ({ file: item.getAsFile(), handle: item.getAsFileSystemHandle?.() }));
  for (const p of pending) {
    if (!p.file) continue;
    let handle: FileSystemFileHandle | undefined;
    try {
      const h = await p.handle;
      if (h && h.kind === 'file') handle = h as FileSystemFileHandle;
    } catch {
      /* pas de handle : ce n'est pas bloquant */
    }
    out.push({ file: p.file, handle });
  }
  if (out.length === 0) for (const file of Array.from(dt.files)) out.push({ file });
  return out;
}

/** Relit un fichier récent ; redemande l'autorisation si besoin. Renvoie null si refusée. */
export async function readFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
  type Perm = { queryPermission?: (o: object) => Promise<string>; requestPermission?: (o: object) => Promise<string> };
  const p = handle as unknown as Perm;
  const opts = { mode: 'read' };
  let state = (await p.queryPermission?.(opts)) ?? 'granted';
  if (state !== 'granted') state = (await p.requestPermission?.(opts)) ?? 'denied';
  if (state !== 'granted') return null;
  return handle.getFile();
}

/** Choisit un seul PDF (sans mémoriser quoi que ce soit) : sélecteur moderne, sinon champ de fichier temporaire. */
export async function pickOnePdf(): Promise<File | null> {
  const picker = (window as unknown as { showOpenFilePicker?: Picker }).showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({ multiple: false, types: [{ description: 'Documents PDF', accept: { 'application/pdf': ['.pdf'] } }] });
      return handle ? await handle.getFile() : null;
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.id = 'file-input-insert';
    input.hidden = true;
    input.addEventListener('change', () => (resolve(input.files?.[0] ?? null), input.remove()));
    input.addEventListener('cancel', () => (resolve(null), input.remove()));
    document.body.append(input);
    input.click();
  });
}
