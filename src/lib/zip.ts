// Empaqueta varios archivos en un ZIP, sin comprimir (método "store").
//
// No se usa una librería porque el caso es mínimo: juntar unos PDF para que el
// navegador haga una sola descarga en vez de una por documento. Y comprimir no
// aportaría nada — un PDF ya viene comprimido por dentro, así que "store" da
// prácticamente el mismo tamaño sin gastar tiempo de CPU.
//
// Formato: APPNOTE.TXT de PKWARE, secciones 4.3.7 (cabecera local), 4.3.12
// (directorio central) y 4.3.16 (registro final).

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
/** Sin ZIP64 no se pueden direccionar más de 4 GB ni más de 65535 entradas. */
const MAX_U32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** El ZIP guarda la fecha en el formato empaquetado de MS-DOS, que arranca en 1980. */
function dosDateTime(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

export function makeZip(entries: ZipEntry[]): Uint8Array {
  if (entries.length === 0) throw new Error("No hay nada que empaquetar.");
  if (entries.length > MAX_ENTRIES) {
    throw new Error("Son demasiados archivos para un solo ZIP. Procésalos por lotes más chicos.");
  }

  const encoder = new TextEncoder();
  const names = entries.map((e) => encoder.encode(e.name));

  let size = END_RECORD;
  for (let i = 0; i < entries.length; i++) {
    const nameLength = names[i]!.length;
    size += LOCAL_HEADER + nameLength + entries[i]!.bytes.length + CENTRAL_HEADER + nameLength;
  }
  if (size > MAX_U32) {
    throw new Error(
      "El lote pesa demasiado para empaquetarlo en un ZIP. Procesa menos archivos a la vez.",
    );
  }

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  const { time, date } = dosDateTime(new Date());
  const offsets: number[] = [];
  const crcs: number[] = [];
  let p = 0;

  for (let i = 0; i < entries.length; i++) {
    const data = entries[i]!.bytes;
    const name = names[i]!;
    const crc = crc32(data);
    offsets.push(p);
    crcs.push(crc);

    view.setUint32(p, 0x04034b50, true);
    view.setUint16(p + 4, 20, true); // versión mínima para extraer
    view.setUint16(p + 6, 0x0800, true); // bit 11: el nombre va en UTF-8
    view.setUint16(p + 8, 0, true); // método 0 = sin comprimir
    view.setUint16(p + 10, time, true);
    view.setUint16(p + 12, date, true);
    view.setUint32(p + 14, crc, true);
    view.setUint32(p + 18, data.length, true); // tamaño comprimido
    view.setUint32(p + 22, data.length, true); // tamaño original
    view.setUint16(p + 26, name.length, true);
    view.setUint16(p + 28, 0, true); // sin campo extra
    p += LOCAL_HEADER;

    out.set(name, p);
    p += name.length;
    out.set(data, p);
    p += data.length;
  }

  const directoryStart = p;
  for (let i = 0; i < entries.length; i++) {
    const data = entries[i]!.bytes;
    const name = names[i]!;

    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true); // versión que lo creó
    view.setUint16(p + 6, 20, true); // versión mínima para extraer
    view.setUint16(p + 8, 0x0800, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, time, true);
    view.setUint16(p + 14, date, true);
    view.setUint32(p + 16, crcs[i]!, true);
    view.setUint32(p + 20, data.length, true);
    view.setUint32(p + 24, data.length, true);
    view.setUint16(p + 28, name.length, true);
    view.setUint16(p + 30, 0, true); // sin campo extra
    view.setUint16(p + 32, 0, true); // sin comentario
    view.setUint16(p + 34, 0, true); // disco donde empieza
    view.setUint16(p + 36, 0, true); // atributos internos
    view.setUint32(p + 38, 0, true); // atributos externos
    view.setUint32(p + 42, offsets[i]!, true);
    p += CENTRAL_HEADER;

    out.set(name, p);
    p += name.length;
  }

  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 4, 0, true); // número de este disco
  view.setUint16(p + 6, 0, true); // disco donde empieza el directorio
  view.setUint16(p + 8, entries.length, true);
  view.setUint16(p + 10, entries.length, true);
  view.setUint32(p + 12, p - directoryStart, true);
  view.setUint32(p + 16, directoryStart, true);
  view.setUint16(p + 20, 0, true); // sin comentario

  return out;
}
