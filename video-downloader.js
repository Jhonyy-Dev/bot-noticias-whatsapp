// LIBRERÍA PARA DESCARGAR VIDEOS DE YOUTUBE
// Usa múltiples métodos: API externa + ytdl-core

const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const axios = require('axios');

class VideoDownloader {
  constructor() {
    this.downloadDir = path.join(__dirname, 'downloads');
    this.ensureDownloadDir();
  }

  ensureDownloadDir() {
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  // Validar que el archivo sea un MP4 real
  isValidMP4(buffer) {
    if (buffer.length < 10000) return false; // Muy pequeño
    
    // Verificar magic bytes de MP4
    const header = buffer.toString('hex', 0, 12);
    return header.includes('66747970') || // ftyp
           header.includes('6d646174') || // mdat
           (buffer[0] === 0x00 && buffer[4] === 0x66); // MP4 signature
  }

  // MÉTODO 1: Descargar usando yt-dlp portable (más confiable)
  async downloadWithYtDlpPortable(videoUrl, outputPath) {
    console.log('🔄 Método 1: Descargando con yt-dlp portable...');
    
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      // Intentar usar yt-dlp desde el sistema
      console.log('📡 Descargando video con yt-dlp...');
      
      const command = `yt-dlp -f "best[height<=720][ext=mp4]/best[ext=mp4]/best" --no-playlist --no-warnings --quiet -o "${outputPath}" "${videoUrl}"`;
      
      await execPromise(command, {
        timeout: 90000, // 90 segundos
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer
      });
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 100000) {
          console.log(`✅ yt-dlp: Video descargado (${Math.round(stats.size / 1024)} KB)`);
          return outputPath;
        } else {
          throw new Error('Archivo descargado es demasiado pequeño');
        }
      } else {
        throw new Error('El archivo no se creó');
      }
      
    } catch (error) {
      console.error(`❌ yt-dlp falló: ${error.message}`);
      throw error;
    }
  }

  // MÉTODO 2: Descargar con ytdl-core (respaldo)
  async downloadWithYtdlCore(videoUrl, outputPath) {
    console.log('🔄 Método 2: Descargando con ytdl-core...');
    
    try {
      // Crear agente ytdl con configuración actualizada
      const agent = ytdl.createAgent([
        {
          "name": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      ]);
      
      const info = await ytdl.getInfo(videoUrl, { agent });
      
      const format = ytdl.chooseFormat(info.formats, { 
        quality: 'highest',
        filter: 'audioandvideo'
      });
      
      if (!format) {
        throw new Error('No se encontró un formato adecuado');
      }
      
      return new Promise((resolve, reject) => {
        const stream = ytdl(videoUrl, { 
          format: format,
          agent: agent
        });
        const writeStream = fs.createWriteStream(outputPath);
        
        stream.pipe(writeStream);
        
        stream.on('error', (error) => {
          console.error('❌ Error en el stream de descarga:', error.message);
          reject(error);
        });
        
        writeStream.on('finish', () => {
          // Verificar que el archivo se descargó correctamente
          if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            if (stats.size > 100000) { // Mínimo 100KB
              console.log(`✅ ytdl-core: Video descargado (${Math.round(stats.size / 1024)} KB)`);
              resolve(outputPath);
            } else {
              reject(new Error('Archivo descargado es demasiado pequeño'));
            }
          } else {
            reject(new Error('Archivo no se creó'));
          }
        });
        
        writeStream.on('error', (error) => {
          console.error('❌ Error escribiendo archivo:', error.message);
          reject(error);
        });
      });
      
    } catch (error) {
      console.error(`❌ ytdl-core falló: ${error.message}`);
      throw error;
    }
  }

  // FUNCIÓN PRINCIPAL: Descargar video con múltiples métodos
  async downloadVideo(videoUrl, outputFilename = null) {
    console.log(`🎬 INICIANDO DESCARGA DE VIDEO: ${videoUrl}`);
    
    const videoId = this.extractVideoId(videoUrl);
    if (!videoId) {
      throw new Error('No se pudo extraer ID del video');
    }
    
    const filename = outputFilename || `${videoId}.mp4`;
    const outputPath = path.join(this.downloadDir, filename);
    
    // Limpiar archivo previo si existe
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    
    // Probar métodos en orden
    const methods = [
      { name: 'yt-dlp', fn: () => this.downloadWithYtDlpPortable(videoUrl, outputPath) },
      { name: 'ytdl-core', fn: () => this.downloadWithYtdlCore(videoUrl, outputPath) }
    ];
    
    for (const method of methods) {
      try {
        console.log(`\n🔄 Probando método: ${method.name}`);
        const downloadedPath = await method.fn();
        
        // Validación final
        if (fs.existsSync(downloadedPath)) {
          const buffer = fs.readFileSync(downloadedPath);
          if (this.isValidMP4(buffer)) {
            console.log(`🎉 ¡VIDEO MP4 DESCARGADO EXITOSAMENTE CON ${method.name}!`);
            return downloadedPath;
          } else {
            console.log(`❌ ${method.name}: Archivo no es MP4 válido`);
            fs.unlinkSync(downloadedPath);
          }
        }
      } catch (error) {
        console.error(`❌ ${method.name} falló: ${error.message}`);
        // Continuar con el siguiente método
      }
    }
    
    throw new Error('❌ TODOS LOS MÉTODOS DE DESCARGA FALLARON');
  }

  extractVideoId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  }
}

module.exports = VideoDownloader;
