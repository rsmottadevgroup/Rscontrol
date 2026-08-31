/**
 * voice.js
 * Captura de voz 100% local, utilizando exclusivamente a Web Speech API
 * nativa do navegador (window.SpeechRecognition / window.webkitSpeechRecognition).
 *
 * NÃO utiliza OpenAI, ChatGPT, Gemini, Claude, Azure Speech, Google Cloud
 * Speech ou qualquer outro serviço externo. Nenhum áudio é armazenado —
 * apenas o texto retornado pelo motor de reconhecimento do navegador é
 * processado, localmente, pelo commandParser.js.
 *
 * Fluxo:
 *   usuário toca no microfone
 *     -> navegador solicita permissão
 *     -> Web Speech API captura a fala
 *     -> texto é retornado
 *     -> CommandParser interpreta o comando
 *     -> ação é executada (em ui.js / app.js)
 */

const Voice = (() => {
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  let recognition = null;
  let isListening = false;

  const listeners = {
    onStart: [],
    onResult: [],
    onError: [],
    onEnd: [],
  };

  function isSupported() {
    return SpeechRecognitionAPI !== null;
  }

  function _emit(name, payload) {
    listeners[name].forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(err); }
    });
  }

  function on(eventName, fn) {
    const key = `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`;
    if (listeners[key]) listeners[key].push(fn);
  }

  function _ensureRecognition() {
    if (!isSupported()) return null;
    if (recognition) return recognition;

    recognition = new SpeechRecognitionAPI();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isListening = true;
      _emit("start");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      _emit("result", { finalText: finalText.trim(), interimText: interimText.trim() });
    };

    recognition.onerror = (event) => {
      let reason = "unknown";
      switch (event.error) {
        case "not-allowed":
        case "service-not-allowed":
          reason = "permission-denied";
          break;
        case "no-speech":
          reason = "no-speech";
          break;
        case "audio-capture":
          reason = "no-microphone";
          break;
        default:
          reason = event.error || "unknown";
      }
      _emit("error", { reason, original: event.error });
    };

    recognition.onend = () => {
      isListening = false;
      _emit("end");
    };

    return recognition;
  }

  function start() {
    if (!isSupported()) {
      _emit("error", { reason: "unsupported" });
      return;
    }
    const rec = _ensureRecognition();
    if (!rec || isListening) return;
    try {
      rec.start();
    } catch (err) {
      // start() pode lançar erro se já estiver ativo
      console.error("Erro ao iniciar reconhecimento de voz:", err);
    }
  }

  function stop() {
    if (recognition && isListening) {
      recognition.stop();
    }
  }

  function abort() {
    if (recognition) {
      recognition.abort();
      isListening = false;
    }
  }

  return { isSupported, start, stop, abort, on, get isListening() { return isListening; } };
})();
