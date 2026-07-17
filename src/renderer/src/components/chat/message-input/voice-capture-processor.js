// Plain JS: AudioWorkletGlobalScope isn't covered by this project's DOM lib
// config, so this file intentionally sits outside the TS program.
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      this.port.postMessage(channel.slice());
    }
    return true;
  }
}

registerProcessor('voice-capture-processor', VoiceCaptureProcessor);
