export interface ExifField {
  label: string;
  value: string;
  sensitivity: "primary" | "secondary" | "sensitive";
}

const TAGS: Record<number, { label: string; sensitivity: ExifField["sensitivity"] }> = {
  0x010f: { label: "Camera make", sensitivity: "primary" },
  0x0110: { label: "Camera model", sensitivity: "primary" },
  0x0112: { label: "Orientation", sensitivity: "secondary" },
  0x0131: { label: "Software", sensitivity: "sensitive" },
  0x0132: { label: "Modified", sensitivity: "secondary" },
  0x829a: { label: "Exposure time", sensitivity: "primary" },
  0x829d: { label: "F-number", sensitivity: "primary" },
  0x8827: { label: "ISO", sensitivity: "primary" },
  0x9003: { label: "Captured", sensitivity: "primary" },
  0x9209: { label: "Flash", sensitivity: "secondary" },
  0x920a: { label: "Focal length", sensitivity: "primary" },
  0xa002: { label: "Image width", sensitivity: "primary" },
  0xa003: { label: "Image height", sensitivity: "primary" },
  0x8825: { label: "GPS metadata", sensitivity: "sensitive" },
};

function readString(view: DataView, offset: number, length: number): string {
  const chars: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const code = view.getUint8(offset + i);
    if (code !== 0) chars.push(code);
  }
  return String.fromCharCode(...chars).trim();
}

function readAscii(view: DataView, tiffStart: number, valueOffset: number, count: number, little: boolean): string {
  const inline = count <= 4;
  const offset = inline ? valueOffset : tiffStart + view.getUint32(valueOffset, little);
  return readString(view, offset, count);
}

function readRational(view: DataView, tiffStart: number, valueOffset: number, little: boolean): string {
  const offset = tiffStart + view.getUint32(valueOffset, little);
  const numerator = view.getUint32(offset, little);
  const denominator = view.getUint32(offset + 4, little);
  if (!denominator) return String(numerator);
  const value = numerator / denominator;
  return value < 1 ? `1/${Math.round(1 / value)}` : value.toFixed(1).replace(/\.0$/, "");
}

function readValue(view: DataView, tiffStart: number, entryOffset: number, little: boolean): string | null {
  const type = view.getUint16(entryOffset + 2, little);
  const count = view.getUint32(entryOffset + 4, little);
  const valueOffset = entryOffset + 8;

  if (type === 2) return readAscii(view, tiffStart, valueOffset, count, little);
  if (type === 3) return String(view.getUint16(valueOffset, little));
  if (type === 4) return String(view.getUint32(valueOffset, little));
  if (type === 5) return readRational(view, tiffStart, valueOffset, little);
  return null;
}

function readIfd(view: DataView, tiffStart: number, ifdOffset: number, little: boolean, fields: ExifField[]) {
  const entryCount = view.getUint16(tiffStart + ifdOffset, little);
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = tiffStart + ifdOffset + 2 + i * 12;
    const tag = view.getUint16(entryOffset, little);
    const config = TAGS[tag];
    if (!config) continue;
    const value = readValue(view, tiffStart, entryOffset, little);
    if (value) fields.push({ label: config.label, value, sensitivity: config.sensitivity });
  }
}

export async function parseExif(file: File): Promise<ExifField[]> {
  if (!["image/jpeg", "image/tiff"].includes(file.type)) return [];
  const buffer = await file.slice(0, 256 * 1024).arrayBuffer();
  const view = new DataView(buffer);
  const fields: ExifField[] = [];

  let offset = file.type === "image/tiff" ? 0 : 2;
  while (offset + 4 < view.byteLength) {
    const marker = file.type === "image/tiff" ? 0x2a : view.getUint16(offset);
    const segmentLength = file.type === "image/tiff" ? view.byteLength : view.getUint16(offset + 2);
    const tiffStart = file.type === "image/tiff" ? 0 : offset + 10;

    if (file.type === "image/tiff" || marker === 0xffe1) {
      if (file.type !== "image/tiff" && readString(view, offset + 4, 4) !== "Exif") return [];
      const endian = readString(view, tiffStart, 2);
      const little = endian === "II";
      if (!little && endian !== "MM") return [];
      const firstIfdOffset = view.getUint32(tiffStart + 4, little);
      readIfd(view, tiffStart, firstIfdOffset, little, fields);
      return fields;
    }

    offset += 2 + segmentLength;
  }

  return fields;
}
