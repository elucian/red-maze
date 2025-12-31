
class AudioService {
  private ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 0.1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playWaka() {
    this.playTone(150, 'triangle', 0.1, 0.05);
    setTimeout(() => this.playTone(100, 'triangle', 0.1, 0.05), 50);
  }

  playDeath() {
    this.playTone(400, 'sawtooth', 0.5, 0.1);
    setTimeout(() => this.playTone(300, 'sawtooth', 0.5, 0.1), 200);
    setTimeout(() => this.playTone(200, 'sawtooth', 0.5, 0.1), 400);
  }

  playPower() {
    this.playTone(800, 'square', 0.2, 0.05);
  }

  playEatGhost() {
    this.playTone(1000, 'sine', 0.3, 0.1);
  }

  playStart() {
    const tones = [440, 554, 659, 880];
    tones.forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'sine', 0.2, 0.1), i * 150);
    });
  }
}

export const audioService = new AudioService();
