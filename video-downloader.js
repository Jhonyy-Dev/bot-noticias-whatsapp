// LIBRERÍA ESPECIALIZADA PARA DESCARGAR VIDEOS REALES DE YOUTUBE
// Múltiples métodos robustos para garantizar descarga de MP4

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

  // MÉTODO 1: Usar yt-dlp (el más robusto)
  async downloadWithYtDlp(videoUrl, outputPath) {
    console.log('🔄 Método 1: Probando yt-dlp...');
    
    try {
      const command = `yt-dlp -f "best[height<=720][ext=mp4]" --no-playlist -o "${outputPath}" "${videoUrl}"`;
      
      execSync(command, { 
        stdio: 'pipe',
        timeout: 60000 // 60 segundos timeout
      });
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 100000) { // Mínimo 100KB
          console.log(`✅ yt-dlp: Video descargado (${Math.round(stats.size / 1024)} KB)`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.log(`❌ yt-dlp falló: ${error.message}`);
      return false;
    }
  }

  // MÉTODO 2: Usar youtube-dl
  async downloadWithYoutubeDl(videoUrl, outputPath) {
    console.log('🔄 Método 2: Probando youtube-dl...');
    
    try {
      const command = `youtube-dl -f "best[height<=720][ext=mp4]" --no-playlist -o "${outputPath}" "${videoUrl}"`;
      
      execSync(command, { 
        stdio: 'pipe',
        timeout: 60000
      });
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 100000) {
          console.log(`✅ youtube-dl: Video descargado (${Math.round(stats.size / 1024)} KB)`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.log(`❌ youtube-dl falló: ${error.message}`);
      return false;
    }
  }

  // MÉTODO 3: Usar ffmpeg con URL directa
  async downloadWithFfmpeg(videoUrl, outputPath) {
    console.log('🔄 Método 3: Probando ffmpeg...');
    
    try {
      const command = `ffmpeg -i "${videoUrl}" -c copy -t 60 "${outputPath}" -y`;
      
      execSync(command, { 
        stdio: 'pipe',
        timeout: 60000
      });
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 100000) {
          console.log(`✅ ffmpeg: Video descargado (${Math.round(stats.size / 1024)} KB)`);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.log(`❌ ffmpeg falló: ${error.message}`);
      return false;
    }
  }

  // MÉTODO 4: API externa robusta
  async downloadWithAPI(videoUrl, outputPath) {
    console.log('🔄 Método 4: Probando API externa...');
    
    try {
      const fetch = require('node-fetch');
      
      // Usar API de descarga pública
      const apiResponse = await fetch('https://api.vevioz.com/api/button/mp4/720', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify({ url: videoUrl })
      });
      
      const data = await apiResponse.json();
      
      if (data.success && data.url) {
        console.log('📥 Descargando desde API externa...');
        
        const videoResponse = await fetch(data.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (videoResponse.ok) {
          const buffer = await videoResponse.buffer();
          
          // Validar que sea MP4 real
          if (this.isValidMP4(buffer)) {
            fs.writeFileSync(outputPath, buffer);
            console.log(`✅ API externa: Video MP4 descargado (${Math.round(buffer.length / 1024)} KB)`);
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.log(`❌ API externa falló: ${error.message}`);
      return false;
    }
  }

  // MÉTODO 5: Usar curl con extractor personalizado
  async downloadWithCurl(videoUrl, outputPath) {
    console.log('🔄 Método 5: Probando curl...');
    
    try {
      // Extraer URL directa del video usando curl
      const extractCommand = `curl -s "https://www.y2mate.com/mates/en68/analyze/ajax" ` +
        `-H "Content-Type: application/x-www-form-urlencoded" ` +
        `-d "k_query=${encodeURIComponent(videoUrl)}&k_page=home&hl=en&q_auto=0"`;
      
      const extractResult = execSync(extractCommand, { encoding: 'utf8', timeout: 30000 });
      const extractData = JSON.parse(extractResult);
      
      if (extractData.status === 'ok' && extractData.result) {
        // Buscar enlace de descarga MP4
        const downloadKey = Object.keys(extractData.result).find(key => 
          extractData.result[key].f === 'mp4' && extractData.result[key].q === '720p'
        );
        
        if (downloadKey) {
          const convertCommand = `curl -s "https://www.y2mate.com/mates/en68/convert" ` +
            `-H "Content-Type: application/x-www-form-urlencoded" ` +
            `-d "vid=${extractData.result.vid}&k=${downloadKey}"`;
          
          const convertResult = execSync(convertCommand, { encoding: 'utf8', timeout: 30000 });
          const convertData = JSON.parse(convertResult);
          
          if (convertData.status === 'ok' && convertData.dlink) {
            const downloadCommand = `curl -L "${convertData.dlink}" -o "${outputPath}" --max-time 60`;
            execSync(downloadCommand, { timeout: 60000 });
            
            if (fs.existsSync(outputPath)) {
              const stats = fs.statSync(outputPath);
              if (stats.size > 100000) {
                console.log(`✅ curl: Video descargado (${Math.round(stats.size / 1024)} KB)`);
                return true;
              }
            }
          }
        }
      }
      
      return false;
    } catch (error) {
      console.log(`❌ curl falló: ${error.message}`);
      return false;
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

  // FUNCIÓN PRINCIPAL: Probar todos los métodos hasta que uno funcione
  async downloadVideo(videoUrl, outputFilename = null) {
    console.log(`🎬 INICIANDO DESCARGA REAL DE VIDEO: ${videoUrl}`);
    
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
    
    // PROBAR MÉTODOS EN ORDEN DE ROBUSTEZ
    const methods = [
      () => this.downloadWithYtDlp(videoUrl, outputPath),
      () => this.downloadWithYoutubeDl(videoUrl, outputPath),
      () => this.downloadWithAPI(videoUrl, outputPath),
      () => this.downloadWithCurl(videoUrl, outputPath),
      () => this.downloadWithFfmpeg(videoUrl, outputPath)
    ];
    
    for (let i = 0; i < methods.length; i++) {
      try {
        const success = await methods[i]();
        if (success) {
          // Validación final
          if (fs.existsSync(outputPath)) {
            const buffer = fs.readFileSync(outputPath);
            if (this.isValidMP4(buffer)) {
              console.log(`🎉 ¡VIDEO MP4 REAL DESCARGADO EXITOSAMENTE!`);
              return outputPath;
            } else {
              console.log(`❌ Método ${i+1}: Archivo no es MP4 válido`);
              fs.unlinkSync(outputPath);
            }
          }
        }
      } catch (error) {
        console.log(`❌ Método ${i+1} falló: ${error.message}`);
      }
    }
    
    throw new Error('❌ TODOS LOS MÉTODOS DE DESCARGA FALLARON - No se pudo descargar video real');
  }

  extractVideoId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  }
}

module.exports = VideoDownloader;
