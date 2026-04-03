const { execSync } = require('child_process');
const { badRequest, handleRouteError, readString } = require('./http-utils');

// En producción (Railway) buscamos el chromium del sistema
function getChromiumPath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.NODE_ENV === 'production') {
    for (const cmd of ['which chromium', 'which chromium-browser', 'which google-chrome']) {
      try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch {}
    }
  }
  return undefined; // desarrollo local: puppeteer usa su Chrome bundled
}

module.exports = function registerReportesRoutes({ app, fs, path, puppeteer, baseDir, requireAuth }) {
  function resolveReportFilePath(nombre) {
    const rawName = readString(nombre, 'Nombre de archivo');
    if (rawName.includes('/') || rawName.includes('\\')) throw badRequest('Ruta no permitida');

    const safeName = path.basename(rawName);
    const ext = path.extname(safeName).toLowerCase();
    const allowedExts = new Set(['.html', '.json', '.txt']);
    if (!allowedExts.has(ext)) throw badRequest('Extensión no permitida');

    const reportsDir = path.resolve(baseDir, 'public', 'Reportes Diarios');
    const targetPath = path.resolve(reportsDir, safeName);
    if (!targetPath.startsWith(reportsDir + path.sep)) throw badRequest('Ruta fuera del directorio permitido');

    return { reportsDir, safeName, targetPath };
  }

  // ─── GUARDAR ARCHIVO EN REPORTES DIARIOS ───────────────────────────────────
  app.post('/api/guardar-archivo', requireAuth, async (req, res) => {
    let browser;
    try {
      const { nombre, contenido } = req.body;
      const { reportsDir, safeName, targetPath } = resolveReportFilePath(nombre);
      if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

      fs.writeFileSync(targetPath, String(contenido ?? ''), 'utf8');

      if (safeName.endsWith('.html')) {
        const pdfName = safeName.replace(/\.html$/i, '.pdf');
        const pdfPath = path.resolve(reportsDir, pdfName);
        if (!pdfPath.startsWith(reportsDir + path.sep)) throw badRequest('Ruta PDF inválida');

        const executablePath = getChromiumPath();
        browser = await puppeteer.launch({
          headless: 'new',
          executablePath,
          args: ['--no-sandbox', '--disable-gpu', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(String(contenido ?? ''), { waitUntil: 'networkidle0' });
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          landscape: true,
          printBackground: true,
          margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' }
        });
        await browser.close();
        browser = null;
        console.log('📄 PDF generado:', pdfName);
      }

      res.json({ ok: true });
    } catch (e) {
      handleRouteError(res, e, 'Error guardando archivo:');
    } finally {
      if (browser) {
        try { await browser.close(); }
        catch (closeErr) { console.error('Error cerrando navegador de reportes:', closeErr); }
      }
    }
  });
};
