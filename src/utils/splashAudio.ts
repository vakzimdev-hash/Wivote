// Web Audio API Synthesizer for WiVote Cinematic Splash Screen
let audioCtx: AudioContext | null = null;
let isMuted = false;

const initAudio = () => {
  if (audioCtx) return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  } catch (e) {
    console.error('Web Audio API not supported', e);
  }
};

export const resumeAudio = async () => {
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch (e) {
      console.warn('AudioContext resume failed', e);
    }
  }
};

export const setMuteState = (mute: boolean) => {
  isMuted = mute;
};

// 1. Soft Startup Synth (0.0s - 0.5s swell)
export const playStartupSynth = () => {
  if (isMuted) return;
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') return;

  const now = audioCtx.currentTime;

  // We will build a lush, soft ambient chord sweep (C major 9: C3, G3, C4, E4, B4)
  const frequencies = [130.81, 196.00, 261.63, 329.63, 493.88];
  
  // Master volume node
  const masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.25, now + 0.5); // swell in 0.5s
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 4.5); // long decay
  
  // Filter for soft ambient texture
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(200, now);
  filter.frequency.exponentialRampToValueAtTime(1200, now + 1.2); // sweep filter cutoff
  filter.Q.setValueAtTime(1, now);

  masterGain.connect(filter);
  filter.connect(audioCtx.destination);

  frequencies.forEach((freq, idx) => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    // Mix triangle and sine waves for a warm, non-harsh tone
    osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now);
    
    // Slight detune for a chorus-like rich effect
    osc.detune.setValueAtTime((idx - 2) * 4, now);

    const oscGain = audioCtx.createGain();
    oscGain.gain.setValueAtTime(0.15, now);

    osc.connect(oscGain);
    oscGain.connect(masterGain);

    osc.start(now);
    osc.stop(now + 5.0);
  });
};

// 2. Gentle "Whoosh" on logo reveal (around 0.5s)
export const playWhoosh = () => {
  if (isMuted) return;
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') return;

  const now = audioCtx.currentTime;

  // We can simulate a whoosh with a noise node, or a fast pitch sweep on a low-passed triangle wave.
  // A pitch sweep is highly reliable and sounds very sci-fi/clean.
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(80, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + 0.8);

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(150, now);
  filter.frequency.exponentialRampToValueAtTime(800, now + 0.8);
  filter.Q.setValueAtTime(2, now);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 1.0);
};

// 3. Digital Beeps for Wi-Fi arcs (around 1.5s, 1.9s, 2.3s)
export const playDigitalBeep = (pitchIndex: number) => {
  if (isMuted) return;
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') return;

  const now = audioCtx.currentTime;
  
  // Three ascending pitches
  const pitches = [659.25, 783.99, 987.77]; // E5, G5, B5
  const freq = pitches[pitchIndex] || 880;

  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.3);
};

// 4. Light Confirmation Chime at completion (5.5s)
export const playConfirmationChime = () => {
  if (isMuted) return;
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') return;

  const now = audioCtx.currentTime;

  // High-fidelity major pentatonic arpeggio (C6, E6, G6, C7)
  const notes = [1046.50, 1318.51, 1567.98, 2093.00];
  
  notes.forEach((freq, idx) => {
    if (!audioCtx) return;
    const delay = idx * 0.08; // staggered arpeggio
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + delay);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.05, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 1.2); // long sparkling decay

    // Add a subtle echo effect using feedback delay
    const delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.15;
    const feedback = audioCtx.createGain();
    feedback.gain.value = 0.4;

    osc.connect(gain);
    
    // Echo path
    gain.connect(delayNode);
    delayNode.connect(feedback);
    feedback.connect(delayNode);
    
    // Output both dry and wet signals
    gain.connect(audioCtx.destination);
    delayNode.connect(audioCtx.destination);

    osc.start(now + delay);
    osc.stop(now + delay + 1.5);
  });
};
