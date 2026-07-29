const audioProcessors = new Map();
let audioContext = null;

async function initAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  // Aguardar o resume importa: montar o grafo com o contexto ainda suspenso
  // resulta em nós conectados que não produzem som.
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
}

class TabAudioProcessor {
  constructor(tabId, stream, initialGain = VOLUME_DEFAULT) {
    this.tabId = tabId;
    this.stream = stream;
    this.gain = clampVolume(initialGain) / 100;
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

      // Dynamics compressor protects the user's ears at high gain values
      // (up to 6x) by attenuating peaks above -24 dBFS. Settings mirror the
      // Web Audio API defaults plus a soft 30 dB knee for a smoother sound.
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
      console.error(`Failed to set up audio graph for tab ${this.tabId}:`, error);
      throw error;
    }
  }

  setGain(gain) {
    if (this.gainNode) {
      this.gain = clampVolume(gain) / 100;
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

    } catch (error) {
      console.error(`Erro ao parar processador de áudio para aba ${this.tabId}:`, error);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Só aceita mensagens de componentes da própria extensão.
  if (!sender || sender.id !== chrome.runtime.id) {
    return false;
  }

  const { action } = message;

  const handlers = {
    'processAudio': () => handleProcessAudio(message.tabId, message.mediaStreamId, message.gain, sendResponse),
    'stopProcessing': () => handleStopProcessing(message.tabId, sendResponse),
    'setGain': () => handleSetGain(message.tabId, message.gain, sendResponse),
    'setMute': () => handleSetMute(message.tabId, message.muted, sendResponse),
    'checkProcessor': () => handleCheckProcessor(message.tabId, sendResponse)
  };

  if (handlers[action]) {
    handlers[action]();
    return true;
  }
});

// Este documento nunca chama chrome.tabCapture: a API não é exposta a documentos
// offscreen. O service worker obtém o mediaStreamId e o envia em `processAudio`;
// aqui ele é apenas consumido por getUserMedia.

// Normaliza o tabId recebido por mensagem. Devolve null em vez de 0 para
// entradas inválidas: colapsar tudo para 0 criava uma chave real no mapa, que
// podia colidir com outra entrada em vez de rejeitar a operação.
function toTabId(input) {
  const parsed = Number.parseInt(input, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Fecha o documento offscreen quando não há mais nada para processar. Sem isso,
// o AudioContext ficava aberto indefinidamente consumindo recursos. O service
// worker recria o documento sob demanda (ele consulta offscreen.hasDocument()).
function closeIfIdle() {
  if (audioProcessors.size > 0) {
    return;
  }
  // Deixa a resposta corrente ser entregue antes de derrubar o documento.
  setTimeout(() => {
    if (audioProcessors.size === 0) {
      globalThis.close();
    }
  }, 0);
}

// Verificar se existe processador ativo para uma aba
function handleCheckProcessor(tabId, sendResponse) {
  const validTabId = toTabId(tabId);
  sendResponse({ exists: validTabId !== null && audioProcessors.has(validTabId) });
}

async function handleProcessAudio(tabId, mediaStreamId, gain, sendResponse) {
  try {
    const validTabId = toTabId(tabId);
    if (validTabId === null) {
      sendResponse({ success: false, error: ErrorCodes.INTERNAL });
      return;
    }

    if (audioProcessors.has(validTabId)) {
      sendResponse({ success: false, error: ErrorCodes.ALREADY_PROCESSING });
      return;
    }

    await initAudioContext();

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
    console.error('Failed to process audio:', error);
    sendResponse({ success: false, error: ErrorCodes.CAPTURE_FAILED });
  }
}

function handleStopProcessing(tabId, sendResponse) {
  try {
    const validTabId = toTabId(tabId);
    const processor = audioProcessors.get(validTabId);
    if (!processor) {
      sendResponse({ success: false, error: ErrorCodes.NO_PROCESSOR });
      return;
    }

    processor.stop();
    audioProcessors.delete(validTabId);

    sendResponse({ success: true });
    closeIfIdle();

  } catch (error) {
    console.error('Failed to stop processing:', error);
    sendResponse({ success: false, error: ErrorCodes.INTERNAL });
  }
}

function handleSetGain(tabId, gain, sendResponse) {
  try {
    const processor = audioProcessors.get(toTabId(tabId));

    if (!processor) {
      sendResponse({ success: false, error: ErrorCodes.NO_PROCESSOR });
      return;
    }

    processor.setGain(gain);
    sendResponse({ success: true });

  } catch (error) {
    console.error('Failed to set gain:', error);
    sendResponse({ success: false, error: ErrorCodes.INTERNAL });
  }
}

function handleSetMute(tabId, muted, sendResponse) {
  try {
    const processor = audioProcessors.get(toTabId(tabId));

    if (!processor) {
      sendResponse({ success: false, error: ErrorCodes.NO_PROCESSOR });
      return;
    }

    processor.setMute(Boolean(muted));
    sendResponse({ success: true });

  } catch (error) {
    console.error('Failed to toggle mute:', error);
    sendResponse({ success: false, error: ErrorCodes.INTERNAL });
  }
}

// Cleanup ativo: o service worker envia `stopProcessing` em chrome.tabs.onRemoved
// e quando o usuário clica em "Parar" no popup. Quando o documento offscreen é
// fechado pelo navegador (extensão desabilitada, browser encerrando), os recursos
// de MediaStream e AudioContext são liberados automaticamente — o evento
// `beforeunload` não é confiável neste contexto, então não dependemos dele.
