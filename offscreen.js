const audioProcessors = new Map();
let audioContext = null;

function initAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

class TabAudioProcessor {
  constructor(tabId, stream, initialGain = 100) {
    this.tabId = parseInt(tabId) || 0;
    this.stream = stream;
    // Validação de ganho inicial
    const validGain = Math.max(0, Math.min(600, parseInt(initialGain) || 100));
    this.gain = validGain / 100;
    this.isMuted = false;

    this.sourceNode = null;
    this.gainNode = null;
    this.compressorNode = null;
    this.destinationNode = null;

    this.setupAudioGraph();
  }

  setupAudioGraph() {
    try {
      this.sourceNode = audioContext.createMediaStreamSource(this.stream);

      this.gainNode = audioContext.createGain();
      this.gainNode.gain.value = this.isMuted ? 0 : this.gain;

      this.compressorNode = audioContext.createDynamicsCompressor();
      this.compressorNode.threshold.value = -24;
      this.compressorNode.knee.value = 30;
      this.compressorNode.ratio.value = 12;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.25;

      this.destinationNode = audioContext.destination;

      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.compressorNode);
      this.compressorNode.connect(this.destinationNode);

    } catch (error) {
      console.error(`Erro ao configurar grafo de áudio para aba ${this.tabId}:`, error);
      throw error;
    }
  }

  setGain(gain) {
    if (this.gainNode) {
      // Validação de ganho
      const validGain = Math.max(0, Math.min(600, parseInt(gain) || 100)) / 100;
      this.gain = validGain;
      this.gainNode.gain.value = this.isMuted ? 0 : this.gain;
    }
  }

  setMute(muted) {
    if (this.gainNode) {
      this.isMuted = muted;
      this.gainNode.gain.value = muted ? 0 : this.gain;
    }
  }

  stop() {
    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
      }
      if (this.compressorNode) {
        this.compressorNode.disconnect();
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      console.log(`Processador de áudio parado para aba ${this.tabId}`);

    } catch (error) {
      console.error(`Erro ao parar processador de áudio para aba ${this.tabId}:`, error);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  const handlers = {
    'processAudio': () => handleProcessAudio(message.tabId, message.mediaStreamId, message.gain, sendResponse),
    'restoreAudio': () => handleRestoreAudio(message.tabId, message.gain, sendResponse),
    'stopProcessing': () => handleStopProcessing(message.tabId, sendResponse),
    'setGain': () => handleSetGain(message.tabId, message.gain, sendResponse),
    'setMute': () => handleSetMute(message.tabId, message.muted, sendResponse)
  };

  if (handlers[action]) {
    handlers[action]();
    return true;
  }
});

async function handleProcessAudio(tabId, mediaStreamId, gain, sendResponse) {
  try {
    const validTabId = parseInt(tabId) || 0;
    
    if (audioProcessors.has(validTabId)) {
      sendResponse({ success: false, error: 'Aba já está sendo processada' });
      return;
    }

    initAudioContext();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: mediaStreamId
        }
      },
      video: false
    });

    const processor = new TabAudioProcessor(validTabId, stream, gain);
    audioProcessors.set(validTabId, processor);

    sendResponse({ success: true });

  } catch (error) {
    console.error('Erro ao processar áudio:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleRestoreAudio(tabId, gain, sendResponse) {
  try {
    if (audioProcessors.has(tabId)) {
      const processor = audioProcessors.get(tabId);
      processor.setGain(gain);
      sendResponse({ success: true });
      return;
    }

    const mediaStreamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    if (!mediaStreamId) {
      sendResponse({ success: false, error: 'Não foi possível obter stream de áudio' });
      return;
    }

    await handleProcessAudio(tabId, mediaStreamId, gain, sendResponse);

  } catch (error) {
    console.error('Erro ao restaurar áudio:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleStopProcessing(tabId, sendResponse) {
  try {
    const processor = audioProcessors.get(tabId);
    if (!processor) {
      sendResponse({ success: false, error: 'Nenhum processador encontrado para esta aba' });
      return;
    }

    processor.stop();
    audioProcessors.delete(tabId);

    sendResponse({ success: true });

  } catch (error) {
    console.error('Erro ao parar processamento:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleSetGain(tabId, gain, sendResponse) {
  try {
    const validTabId = parseInt(tabId) || 0;
    const processor = audioProcessors.get(validTabId);
    
    if (!processor) {
      sendResponse({ success: false, error: 'Nenhum processador encontrado para esta aba' });
      return;
    }

    processor.setGain(gain);
    sendResponse({ success: true });

  } catch (error) {
    console.error('Erro ao definir ganho:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleSetMute(tabId, muted, sendResponse) {
  try {
    const validTabId = parseInt(tabId) || 0;
    const processor = audioProcessors.get(validTabId);
    
    if (!processor) {
      sendResponse({ success: false, error: 'Nenhum processador encontrado para esta aba' });
      return;
    }

    processor.setMute(Boolean(muted));
    sendResponse({ success: true });

  } catch (error) {
    console.error('Erro ao mutar/desmutar:', error);
    sendResponse({ success: false, error: error.message });
  }
}

window.addEventListener('beforeunload', () => {
  for (const processor of audioProcessors.values()) {
    processor.stop();
  }
  audioProcessors.clear();
});
