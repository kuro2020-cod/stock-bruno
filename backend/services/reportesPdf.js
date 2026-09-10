import PDFDocument from 'pdfkit';

function fmtFechaHora(fecha) {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  return d.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function fmtCant(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
}

function drawHeader(doc, titulo, subtitulo) {
  doc.fontSize(16).fillColor('#111827').text(titulo, { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#4b5563').text(subtitulo);
  doc.moveDown(0.8);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#d1d5db')
    .stroke();
  doc.moveDown(0.6);
}

function ensureSpace(doc, needed = 40) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function dibujarTituloCategoria(doc, cat, nItems) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const barH = 28;

  ensureSpace(doc, 56);
  if (doc.y > doc.page.margins.top + 8) doc.moveDown(0.55);

  const yCat = doc.y;
  doc.rect(left, yCat, right - left, barH).fill('#f3f4f6');
  doc
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(String(cat || '').toUpperCase(), left, yCat + 7, {
      width: right - left,
      align: 'center',
      lineBreak: false
    });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#6b7280')
    .text(`${nItems} prod.`, right - 70, yCat + 9, {
      width: 64,
      align: 'right',
      lineBreak: false
    });
  doc.y = yCat + barH + 6;
}

/**
 * @param {{ fechaLabel: string, filas: Array<{ producto_texto?: string, producto_catalogo?: string, cantidad?: any, producto_stock?: any, producto_unidad?: string, categoria_nombre?: string }> }} opts
 * @returns {Promise<Buffer>}
 */
export function generarPdfFaltantes({ fechaLabel, filas }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(
      doc,
      'Reporte de faltantes',
      `Fecha: ${fechaLabel} · ${filas.length} registro(s) · ordenado por categoría`
    );

    if (!filas.length) {
      doc.fontSize(11).fillColor('#6b7280').text('No hay faltantes registrados en esta fecha.');
      doc.end();
      return;
    }

    const cantDe = (row) => {
      if (row.cantidad != null && row.cantidad !== '' && Number.isFinite(Number(row.cantidad))) {
        return Number(row.cantidad);
      }
      if (row.producto_stock != null && Number.isFinite(Number(row.producto_stock))) {
        return Number(row.producto_stock);
      }
      return null;
    };

    const porCategoria = new Map();
    for (const row of filas) {
      const cat = String(row.categoria_nombre || '').trim() || 'Sin categoría';
      if (!porCategoria.has(cat)) porCategoria.set(cat, []);
      porCategoria.get(cat).push(row);
    }
    const categorias = [...porCategoria.keys()].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    const cols = { nombre: 40, stock: 420 };
    const rowH = 16;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    const dibujarCabeceraColumnas = () => {
      doc.fontSize(9).fillColor('#374151').font('Helvetica-Bold');
      const yHead = doc.y;
      doc.text('Producto', cols.nombre, yHead, { width: 360 });
      doc.text('Cantidad', cols.stock, yHead, { width: 120, align: 'right' });
      doc.y = yHead + 12;
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.25);
    };

    for (const cat of categorias) {
      const items = porCategoria
        .get(cat)
        .slice()
        .sort((a, b) =>
          String(a.producto_catalogo || a.producto_texto || '').localeCompare(
            String(b.producto_catalogo || b.producto_texto || ''),
            'es',
            { sensitivity: 'base' }
          )
        );

      dibujarTituloCategoria(doc, cat, items.length);

      dibujarCabeceraColumnas();
      doc.font('Helvetica').fontSize(9).fillColor('#111827');

      for (const row of items) {
        ensureSpace(doc, rowH + 10);
        if (doc.y <= doc.page.margins.top + 2) {
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#4b5563')
            .text(`${cat} (cont.)`, left, doc.y);
          doc.moveDown(0.3);
          dibujarCabeceraColumnas();
          doc.font('Helvetica').fontSize(9).fillColor('#111827');
        }

        const y = doc.y;
        const nombre =
          String(row.producto_catalogo || row.producto_texto || '').trim() || '—';
        const cant = cantDe(row);
        const uni = row.producto_unidad ? ` ${row.producto_unidad}` : '';
        doc.text(nombre, cols.nombre, y, { width: 360 });
        doc.text(cant == null ? '—' : `${fmtCant(cant)}${uni}`, cols.stock, y, {
          width: 120,
          align: 'right'
        });
        doc.y = Math.max(doc.y, y + rowH);
      }
    }

    doc.end();
  });
}

/**
 * @param {{ fechaLabel: string, filas: Array<{ codigo?: string, nombre: string, categoria_nombre?: string, stock_actual: any, stock_minimo: any, unidad_medida?: string }> }} opts
 * @returns {Promise<Buffer>}
 */
export function generarPdfStockBajo({ fechaLabel, filas, titulo = 'Productos con stock bajo' }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(
      doc,
      titulo,
      `Al ${fechaLabel} · ${filas.length} producto(s) · ordenado por categoría`
    );

    if (!filas.length) {
      doc.fontSize(11).fillColor('#6b7280').text('No hay productos con stock bajo.');
      doc.end();
      return;
    }

    const porCategoria = new Map();
    for (const p of filas) {
      const cat = String(p.categoria_nombre || '').trim() || 'Sin categoría';
      if (!porCategoria.has(cat)) porCategoria.set(cat, []);
      porCategoria.get(cat).push(p);
    }

    const categorias = [...porCategoria.keys()].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    const cols = {
      nombre: 40,
      stock: 420
    };
    const rowH = 16;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    const dibujarCabeceraColumnas = () => {
      doc.fontSize(9).fillColor('#374151').font('Helvetica-Bold');
      const yHead = doc.y;
      doc.text('Producto', cols.nombre, yHead, { width: 360 });
      doc.text('Cantidad', cols.stock, yHead, { width: 120, align: 'right' });
      doc.y = yHead + 12;
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#e5e7eb').stroke();
      doc.moveDown(0.25);
    };

    for (const cat of categorias) {
      const productos = porCategoria
        .get(cat)
        .slice()
        .sort((a, b) =>
          String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
            sensitivity: 'base'
          })
        );

      dibujarTituloCategoria(doc, cat, productos.length);

      dibujarCabeceraColumnas();

      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      for (const p of productos) {
        ensureSpace(doc, rowH + 10);
        if (doc.y <= doc.page.margins.top + 2) {
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#4b5563')
            .text(`${cat} (cont.)`, left, doc.y);
          doc.moveDown(0.3);
          dibujarCabeceraColumnas();
          doc.font('Helvetica').fontSize(9).fillColor('#111827');
        }

        const y = doc.y;
        const uni = p.unidad_medida ? ` ${p.unidad_medida}` : '';
        doc.text(String(p.nombre || '—'), cols.nombre, y, { width: 360 });
        doc.text(`${fmtCant(p.stock_actual)}${uni}`, cols.stock, y, {
          width: 120,
          align: 'right'
        });
        doc.y = Math.max(doc.y, y + rowH);
      }
    }

    doc.end();
  });
}
