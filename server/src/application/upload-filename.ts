export function decodeUploadFilename(name: string): string {
  if (!name) return '';
  if (/[^\u0000-\u00FF]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (!decoded || decoded.includes('\uFFFD')) return name;
  return decoded;
}

export function originalUploadName(file: {
  originalname?: string;
  filename?: string;
}): string {
  const raw = String(file.originalname || '').split(/[\\/]/).pop() || '';
  const name = decodeUploadFilename(raw);
  return name || file.filename || 'file';
}
