const fs = require('fs').promises;
const path = require('path');

class VideoSchedulerService {
  constructor() {
    if (VideoSchedulerService.instance) {
      return VideoSchedulerService.instance;
    }
    
    this.INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 HORAS EXACTAS - NO CAMBIAR
    this.CHECK_INTERVAL = 15 * 60 * 1000; // Verificar cada 15 minutos
    this.CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Limpiar cada 24 horas
    this.configFile = path.join(process.cwd(), 'video_schedule.json');
    this.retryAttempts = 3;
    this.circuitBreaker = { failures: 0, isOpen: false, nextAttempt: 0 };
    this.lastCleanup = 0;
    
    VideoSchedulerService.instance = this;
    this.startScheduler();
    this.startCleanupScheduler();
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...data
    };
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data);
  }

  async getScheduleData() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      const schedule = JSON.parse(data);
      
      // Auto-limpiar archivos antiguos al leer
      await this.cleanupOldEntries(schedule);
      
      return schedule;
    } catch (error) {
      // Archivo no existe, retornar objeto vacío
      return {};
    }
  }

  async saveScheduleData(scheduleData) {
    try {
      // Agregar metadata de última limpieza
      const dataToSave = {
        ...scheduleData,
        _metadata: {
          lastCleanup: this.lastCleanup,
          createdAt: Date.now(),
          version: '1.0'
        }
      };
      
      await fs.writeFile(this.configFile, JSON.stringify(dataToSave, null, 2));
      this.log('debug', 'Schedule data saved successfully');
    } catch (error) {
      this.log('error', 'Error saving schedule data', { error: error.message });
      throw error;
    }
  }

  async cleanupOldEntries(schedule = null) {
    try {
      if (!schedule) {
        schedule = await this.getScheduleData();
      }

      const now = Date.now();
      let entriesRemoved = 0;
      let cleanupNeeded = false;

      // Verificar si necesita limpieza (cada 24 horas)
      const lastCleanupTime = schedule._metadata?.lastCleanup || 0;
      const timeSinceLastCleanup = now - lastCleanupTime;

      if (timeSinceLastCleanup >= this.CLEANUP_INTERVAL) {
        cleanupNeeded = true;
        this.log('info', 'Starting automatic cleanup of old entries', {
          lastCleanup: lastCleanupTime ? new Date(lastCleanupTime).toISOString() : 'Never',
          hoursSinceLastCleanup: Math.round(timeSinceLastCleanup / (1000 * 60 * 60))
        });

        // Limpiar entradas antiguas (más de 7 días)
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
        const cleanedSchedule = { _metadata: schedule._metadata };

        for (const [groupId, data] of Object.entries(schedule)) {
          if (groupId === '_metadata') continue;

          // Mantener solo entradas de los últimos 7 días
          if (data.timestamp && data.timestamp > sevenDaysAgo) {
            cleanedSchedule[groupId] = data;
          } else {
            entriesRemoved++;
            this.log('debug', 'Removing old entry', {
              groupId,
              entryDate: data.utcDate,
              daysOld: Math.round((now - data.timestamp) / (1000 * 60 * 60 * 24))
            });
          }
        }

        // Actualizar timestamp de limpieza
        this.lastCleanup = now;
        cleanedSchedule._metadata = {
          ...cleanedSchedule._metadata,
          lastCleanup: this.lastCleanup,
          lastCleanupDate: new Date(this.lastCleanup).toISOString(),
          totalEntriesRemoved: (cleanedSchedule._metadata?.totalEntriesRemoved || 0) + entriesRemoved
        };

        // Guardar datos limpios
        await fs.writeFile(this.configFile, JSON.stringify(cleanedSchedule, null, 2));

        this.log('info', 'Cleanup completed', {
          entriesRemoved,
          remainingEntries: Object.keys(cleanedSchedule).length - 1,
          nextCleanup: new Date(this.lastCleanup + this.CLEANUP_INTERVAL).toISOString()
        });

        return cleanedSchedule;
      }

      return schedule;
    } catch (error) {
      this.log('error', 'Error during cleanup', { error: error.message });
      return schedule || {};
    }
  }

  startCleanupScheduler() {
    // Ejecutar limpieza inicial después de 1 minuto
    setTimeout(async () => {
      await this.cleanupOldEntries();
    }, 60 * 1000);

    // Programar limpieza automática cada 24 horas
    setInterval(async () => {
      try {
        await this.cleanupOldEntries();
      } catch (error) {
        this.log('error', 'Scheduled cleanup failed', { error: error.message });
      }
    }, this.CLEANUP_INTERVAL);

    this.log('info', 'Cleanup scheduler started', {
      cleanupIntervalHours: this.CLEANUP_INTERVAL / 1000 / 60 / 60,
      retentionDays: 7
    });
  }

  async getLastSendTime(groupId) {
    try {
      const schedule = await this.getScheduleData();
      return schedule[groupId] || null;
    } catch (error) {
      this.log('error', 'Error getting last send time', { groupId, error: error.message });
      return null;
    }
  }

  async setLastSendTime(groupId, timestamp = Date.now()) {
    try {
      const schedule = await this.getScheduleData();
      
      schedule[groupId] = {
        timestamp,
        utcDate: new Date(timestamp).toISOString(),
        nextAllowed: timestamp + this.INTERVAL_MS,
        nextAllowedDate: new Date(timestamp + this.INTERVAL_MS).toISOString(),
        createdAt: timestamp
      };

      await this.saveScheduleData(schedule);
      this.log('info', 'Last send time updated', { 
        groupId, 
        utcDate: schedule[groupId].utcDate,
        nextSendTime: schedule[groupId].nextAllowedDate
      });
    } catch (error) {
      this.log('error', 'Error setting last send time', { groupId, error: error.message });
      throw error;
    }
  }

  async canSendVideo(groupId) {
    const lastSend = await this.getLastSendTime(groupId);
    const now = Date.now();

    if (!lastSend) {
      this.log('info', 'First time sending video to group', { groupId });
      return { 
        canSend: true, 
        reason: 'FIRST_TIME',
        message: 'Primera vez enviando video a este grupo'
      };
    }

    const timeSinceLastSend = now - lastSend.timestamp;
    
    // VERIFICACIÓN ESTRICTA: DEBE haber pasado EXACTAMENTE 3 horas o más
    const canSend = timeSinceLastSend >= this.INTERVAL_MS;

    if (canSend) {
      const hoursWaited = Math.round(timeSinceLastSend / (1000 * 60 * 60) * 10) / 10;
      this.log('info', '✅ VIDEO PUEDE SER ENVIADO - Han pasado 3+ horas', { 
        groupId, 
        lastSendTime: lastSend.utcDate,
        hoursWaited,
        exactIntervalMs: this.INTERVAL_MS,
        timeSinceLastSendMs: timeSinceLastSend
      });
      return { 
        canSend: true, 
        reason: 'TIME_ELAPSED',
        hoursWaited,
        message: `✅ HAN PASADO ${hoursWaited} HORAS - ENVIANDO VIDEO`
      };
    } else {
      const remainingMs = this.INTERVAL_MS - timeSinceLastSend;
      const remainingMinutes = Math.ceil(remainingMs / (1000 * 60));
      const remainingHours = Math.round(remainingMs / (1000 * 60 * 60) * 10) / 10;
      
      // SILENCIOSO cuando faltan muchas horas para evitar spam de logs
      if (remainingHours > 0.5) {
        return { 
          canSend: false, 
          reason: 'TIME_NOT_ELAPSED', 
          remainingMinutes,
          remainingHours,
          nextAllowedTime: lastSend.nextAllowedDate,
          message: `⏳ FALTAN ${remainingHours} HORAS PARA EL PRÓXIMO ENVÍO`
        };
      }
      
      // Solo mostrar logs detallados cuando faltan menos de 30 minutos
      this.log('debug', '⏳ VIDEO NO PUEDE SER ENVIADO - No han pasado 3 horas completas', {
        groupId,
        remainingMinutes,
        remainingHours,
        nextAllowedTime: lastSend.nextAllowedDate,
        exactIntervalMs: this.INTERVAL_MS,
        timeSinceLastSendMs: timeSinceLastSend,
        stillNeedMs: remainingMs
      });
      
      return { 
        canSend: false, 
        reason: 'TIME_NOT_ELAPSED', 
        remainingMinutes,
        remainingHours,
        nextAllowedTime: lastSend.nextAllowedDate,
        message: `⏳ FALTAN ${remainingHours} HORAS PARA EL PRÓXIMO ENVÍO`
      };
    }
  }

  async sendVideoWithRetry(groupId, sendFunction) {
    // VERIFICACIÓN CRÍTICA: Solo proceder si han pasado exactamente 3 horas
    const canSendResult = await this.canSendVideo(groupId);
    if (!canSendResult.canSend) {
      this.log('debug', '🚫 ENVÍO BLOQUEADO - No han pasado 3 horas exactas', canSendResult);
      return false;
    }

    // Verificar circuit breaker
    if (this.circuitBreaker.isOpen && Date.now() < this.circuitBreaker.nextAttempt) {
      const remainingMinutes = Math.ceil((this.circuitBreaker.nextAttempt - Date.now()) / (1000 * 60));
      this.log('warn', 'Circuit breaker is open, skipping send attempt', { 
        groupId, 
        remainingMinutes 
      });
      return false;
    }

    // Intentar envío con reintentos
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        this.log('info', '🚀 INICIANDO ENVÍO DE VIDEO - 3 HORAS EXACTAS CUMPLIDAS', { 
          groupId, 
          attempt, 
          maxAttempts: this.retryAttempts,
          hoursWaited: canSendResult.hoursWaited
        });
        
        // Ejecutar función de envío
        await sendFunction();
        
        // Éxito - actualizar timestamp y resetear circuit breaker
        await this.setLastSendTime(groupId);
        this.circuitBreaker = { failures: 0, isOpen: false, nextAttempt: 0 };
        
        this.log('info', '✅ VIDEO ENVIADO EXITOSAMENTE - PRÓXIMO ENVÍO EN 3 HORAS', { 
          groupId, 
          attempt,
          sentAt: new Date().toISOString(),
          nextSendTime: new Date(Date.now() + this.INTERVAL_MS).toISOString(),
          intervalHours: this.INTERVAL_MS / (1000 * 60 * 60)
        });
        
        return true;
      } catch (error) {
        this.log('error', 'Failed to send video', { 
          groupId, 
          attempt, 
          maxAttempts: this.retryAttempts,
          error: error.message
        });

        if (attempt === this.retryAttempts) {
          // Activar circuit breaker después de fallos máximos
          this.circuitBreaker.failures++;
          if (this.circuitBreaker.failures >= 3) {
            this.circuitBreaker.isOpen = true;
            this.circuitBreaker.nextAttempt = Date.now() + (30 * 60 * 1000); // 30 min
            this.log('error', 'Circuit breaker opened due to repeated failures', { 
              groupId, 
              nextAttemptTime: new Date(this.circuitBreaker.nextAttempt).toISOString() 
            });
          }
        } else {
          // Esperar antes del siguiente intento (backoff exponencial)
          const waitTime = 1000 * Math.pow(2, attempt - 1);
          this.log('info', `Waiting ${waitTime/1000}s before retry`, { attempt });
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    return false;
  }

  startScheduler() {
    // NO ejecutar verificación inmediata - esperar a que WhatsApp se conecte
    
    // Programar verificaciones periódicas - SOLO VERIFICAR, NO ENVIAR AUTOMÁTICAMENTE
    setInterval(() => {
      this.checkAndSendVideo();
    }, this.CHECK_INTERVAL);

    this.log('info', '🔄 VIDEO SCHEDULER INICIADO - ENVÍO CADA 3 HORAS EXACTAS', { 
      checkIntervalMinutes: this.CHECK_INTERVAL / 1000 / 60,
      sendIntervalHours: this.INTERVAL_MS / 1000 / 60 / 60,
      strictMode: 'EXACTLY_3_HOURS',
      configFile: this.configFile,
      note: 'Esperando conexión WhatsApp antes de verificar envíos'
    });
  }

  async checkAndSendVideo() {
    try {
      // VERIFICACIÓN CRÍTICA: Solo proceder si WhatsApp está conectado
      if (!global.waSocket) {
        // Silencioso - no hacer logs cuando WhatsApp no está conectado
        return;
      }

      const groupId = process.env.TARGET_GROUP_NAME || 'Club Dev Maval';
      this.log('debug', '🔍 VERIFICANDO SI PUEDEN ENVIARSE VIDEOS', { 
        groupId, 
        time: new Date().toISOString(),
        requiredIntervalHours: 3
      });
      
      const success = await this.sendVideoWithRetry(groupId, async () => {
        // 🚨 CRÍTICO: REEMPLAZA ESTA FUNCIÓN CON TU LÓGICA ACTUAL DE ENVÍO
        // Esta función SOLO se ejecutará si han pasado exactamente 3 horas
        await this.executeVideoSend();
      });

      if (success) {
        this.log('info', '✅ ENVÍO PROGRAMADO COMPLETADO - PRÓXIMO EN 3 HORAS', { groupId });
      } else {
        this.log('debug', '⏳ ENVÍO OMITIDO - AÚN NO HAN PASADO 3 HORAS COMPLETAS', { groupId });
      }
    } catch (error) {
      this.log('error', 'Scheduler check failed', { error: error.message });
    }
  }

  async executeVideoSend() {
    // 🚨 REEMPLAZA ESTA FUNCIÓN CON TU LÓGICA ACTUAL DE ENVÍO DE VIDEOS
    // EJEMPLO DE LO QUE DEBE CONTENER:
    /*
    const videos = await getLatestYouTubeVideos(); 
    const selectedVideo = videos[Math.floor(Math.random() * Math.min(videos.length, process.env.MAX_VIDEOS_TO_FETCH || 100))];
    const description = await generateVideoDescription(selectedVideo);
    await sendVideoToWhatsAppGroup(selectedVideo, description);
    */
    
    this.log('info', '🎬 EJECUTANDO ENVÍO DE VIDEO...');
    
    // Importar módulos necesarios
    const { searchYouTubeShorts, downloadYouTubeShort } = require('./youtube-api');
    const { enhanceDescription } = require('./gemini-ai');
    const fs = require('fs');
    const path = require('path');
    
    try {
      // Verificar que haya una conexión activa a WhatsApp
      if (!global.waSocket) {
        throw new Error('No hay conexión activa a WhatsApp');
      }
      
      const waSocket = global.waSocket;
      
      // Buscar el grupo objetivo usando Baileys directamente
      const targetGroupName = process.env.TARGET_GROUP_NAME || 'Club Dev Maval';
      console.log(`🔍 Buscando grupo: ${targetGroupName}`);
      
      const chats = await waSocket.groupFetchAllParticipating();
      const groups = Object.values(chats);
      
      console.log(`📋 Grupos disponibles:`);
      groups.forEach((group, index) => {
        console.log(`  ${index + 1}. ${group.subject}`);
      });
      
      const targetGroup = groups.find(group => 
        group.subject && group.subject.toLowerCase().includes(targetGroupName.toLowerCase())
      );

      if (!targetGroup) {
        throw new Error(`Grupo objetivo '${targetGroupName}' no encontrado. Grupos disponibles: ${groups.map(g => g.subject).join(', ')}`);
      }
      
      console.log(`✅ Grupo encontrado: ${targetGroup.subject}`);
      
      // Obtener temas de YouTube desde .env
      const topics = process.env.YOUTUBE_TOPIC ? 
        process.env.YOUTUBE_TOPIC.split(',').map(t => t.trim()) : 
        ['tips de programación'];
      
      // Seleccionar un tema aleatorio
      const selectedTopic = topics[Math.floor(Math.random() * topics.length)];
      this.log('info', `Tema seleccionado: ${selectedTopic}`);
      
      // Buscar videos de YouTube
      const videos = await searchYouTubeShorts(selectedTopic, parseInt(process.env.MAX_VIDEOS_TO_FETCH) || 100);
      
      if (!videos || videos.length === 0) {
        throw new Error('No se encontraron videos de YouTube');
      }
      
      // Seleccionar un video aleatorio
      const selectedVideo = videos[Math.floor(Math.random() * Math.min(videos.length, 10))];
      this.log('info', `Video seleccionado: ${selectedVideo.title} por ${selectedVideo.channelTitle}`);
      
      // Crear directorio para descargas si no existe
      const downloadsDir = path.join(__dirname, 'downloads');
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }
      
      // Nombre del archivo de salida
      const outputFilename = `${selectedVideo.id}.mp4`;
      const outputPath = path.join(downloadsDir, outputFilename);
      
      // Descargar el video
      this.log('info', `Descargando video: ${selectedVideo.url}`);
      await downloadYouTubeShort(selectedVideo.url, outputPath);
      
      // Verificar si el archivo existe
      if (!fs.existsSync(outputPath)) {
        throw new Error('El archivo de video no se encontró después de la descarga');
      }
      
      // Generar descripción mejorada
      const description = await enhanceDescription(
        selectedVideo.title, 
        selectedVideo.description, 
        selectedTopic
      );
      
      // Leer el archivo
      const videoBuffer = fs.readFileSync(outputPath);
      
      // Enviar el video al grupo
      await waSocket.sendMessage(targetGroup.id, { 
        video: videoBuffer,
        caption: description,
        gifPlayback: false
      });
      
      this.log('info', '✅ Video enviado correctamente');
      
      // Eliminar el archivo después de enviarlo
      fs.unlinkSync(outputPath);
      
    } catch (error) {
      this.log('error', 'Error en executeVideoSend', { error: error.message });
      throw error;
    }
  }

  async getStatus() {
    try {
      const groupId = process.env.TARGET_GROUP_NAME || 'Club Dev Maval';
      const canSendResult = await this.canSendVideo(groupId);
      const lastSend = await this.getLastSendTime(groupId);
      const fileStats = await this.getFileStats();
      
      return {
        status: 'active',
        strictMode: 'EXACTLY_3_HOURS',
        groupId,
        canSend: canSendResult.canSend,
        reason: canSendResult.reason,
        message: canSendResult.message,
        lastSendTime: lastSend?.utcDate || 'Never',
        nextAllowedTime: lastSend?.nextAllowedDate || 'Now',
        remainingHours: canSendResult.remainingHours || 0,
        intervalHours: this.INTERVAL_MS / 1000 / 60 / 60,
        circuitBreaker: {
          isOpen: this.circuitBreaker.isOpen,
          failures: this.circuitBreaker.failures,
          nextAttemptTime: this.circuitBreaker.isOpen ? 
            new Date(this.circuitBreaker.nextAttempt).toISOString() : null
        },
        fileStats,
        cleanup: {
          intervalHours: this.CLEANUP_INTERVAL / 1000 / 60 / 60,
          retentionDays: 7,
          nextCleanup: new Date(this.lastCleanup + this.CLEANUP_INTERVAL).toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  async getFileStats() {
    try {
      const stats = await fs.stat(this.configFile);
      const schedule = await this.getScheduleData();
      
      return {
        exists: true,
        sizeBytes: stats.size,
        sizeKB: Math.round(stats.size / 1024 * 100) / 100,
        lastModified: stats.mtime.toISOString(),
        totalEntries: Object.keys(schedule).length - (schedule._metadata ? 1 : 0),
        lastCleanup: schedule._metadata?.lastCleanupDate || 'Never',
        totalEntriesRemoved: schedule._metadata?.totalEntriesRemoved || 0
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }
}

// Crear instancia única
const videoScheduler = new VideoSchedulerService();

// Funciones de debugging
async function getSchedulerStatus() {
  const status = await videoScheduler.getStatus();
  console.log('=== VIDEO SCHEDULER STATUS - 3 HOUR INTERVALS ===');
  console.log(JSON.stringify(status, null, 2));
  return status;
}

module.exports = { VideoSchedulerService, videoScheduler, getSchedulerStatus };
