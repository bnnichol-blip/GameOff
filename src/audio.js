/**
 * Audio System for Void Artillery
 * Uses Web Audio API for procedural sound effects
 */

class AudioSystem {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.initialized = false;

        // Charge sound state
        this.chargeOsc = null;
        this.chargeGain = null;

        // Background music
        this.bgMusic = null;
        this.musicStarted = false;
    }

    // Initialize on first user interaction (required by browsers)
    init() {
        if (this.initialized) return;

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.masterGain.gain.value = 0.3;  // Master volume
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
        }
    }

    // ========================================================================
    // Background Music
    // ========================================================================

    startBackgroundMusic() {
        if (this.musicStarted) return;

        try {
            this.bgMusic = new Audio('Mesmerizing Galaxy Loop.mp3');
            this.bgMusic.loop = true;
            this.bgMusic.volume = 0.15;  // Background music volume

            // Must be called from user interaction context
            const playPromise = this.bgMusic.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('Background music started');
                    this.musicStarted = true;
                }).catch(e => {
                    console.warn('Could not autoplay music:', e);
                    // Try again on next user interaction
                    this.musicStarted = false;
                });
            }
        } catch (e) {
            console.warn('Could not load background music:', e);
        }
    }

    // Call this from any user interaction to ensure music plays
    ensureMusicPlaying() {
        if (this.bgMusic && this.bgMusic.paused) {
            this.bgMusic.play().catch(() => {});
        }
    }

    setMusicVolume(volume) {
        if (this.bgMusic) {
            this.bgMusic.volume = Math.max(0, Math.min(1, volume));
        }
    }

    // Resume context if suspended (browser autoplay policy)
    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // ========================================================================
    // Charge Sound (rising tone while holding fire)
    // ========================================================================

    startCharge() {
        if (!this.initialized) return;
        this.resume();

        // Stop any existing charge sound
        this.stopCharge();

        // Create oscillator for charge sound
        this.chargeOsc = this.ctx.createOscillator();
        this.chargeGain = this.ctx.createGain();

        this.chargeOsc.type = 'sawtooth';
        this.chargeOsc.frequency.value = 100;  // Start low

        this.chargeGain.gain.value = 0.15;

        this.chargeOsc.connect(this.chargeGain);
        this.chargeGain.connect(this.masterGain);

        this.chargeOsc.start();
    }

    updateCharge(power) {
        if (!this.chargeOsc || !this.chargeGain) return;

        // Ramp frequency from 100 Hz to 800 Hz based on power
        const freq = 100 + power * 700;
        this.chargeOsc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        // Increase volume slightly as power increases
        this.chargeGain.gain.setValueAtTime(0.1 + power * 0.15, this.ctx.currentTime);
    }

    stopCharge() {
        if (this.chargeOsc) {
            try {
                this.chargeOsc.stop();
            } catch (e) {}
            this.chargeOsc = null;
        }
        this.chargeGain = null;
    }

    // ========================================================================
    // Fire Sound (release shot)
    // ========================================================================

    playFire() {
        if (!this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;

        // Punchy "thwump" sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.2);

        // Add some noise for texture
        this.playNoiseBurst(0.1, 0.15);
    }

    // ========================================================================
    // Bounce Sound
    // ========================================================================

    playBounce() {
        if (!this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;

        // Metallic ping
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800 + Math.random() * 400, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    // ========================================================================
    // Explosion Sound
    // ========================================================================

    playExplosion(intensity = 1) {
        if (!this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;
        const duration = 0.3 + intensity * 0.3;

        // Low rumble
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(80 * intensity, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + duration);

        gain.gain.setValueAtTime(0.5 * intensity, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration);

        // Noise burst for crackle
        this.playNoiseBurst(0.3 * intensity, duration * 0.8);
    }

    // ========================================================================
    // Void Sound (ominous hum when close)
    // ========================================================================

    playVoidTouch() {
        if (!this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;

        // Dissonant chord
        const freqs = [55, 58, 82];  // Dissonant low frequencies
        for (const freq of freqs) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 1);
        }
    }

    // ========================================================================
    // Kill Sound (dramatic death)
    // ========================================================================

    playKill() {
        if (!this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;

        // Big explosion
        this.playExplosion(1.5);

        // Add descending tone for drama
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.8);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 1);
    }

    // ========================================================================
    // UI Sounds
    // ========================================================================

    playSelect() {
        if (!this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(550, now + 0.05);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    playConfirm() {
        if (!this.initialized) return;
        this.resume();
        this.ensureMusicPlaying();  // Ensure music starts on user interaction

        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.setValueAtTime(440, now + 0.08);
        osc.frequency.setValueAtTime(550, now + 0.16);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.35);
    }

    // ========================================================================
    // Glitch Event Sound
    // ========================================================================

    playGlitch() {
        if (!this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;

        // Create a distorted, glitchy sound with rapid frequency changes
        // Multiple detuned oscillators for digital corruption effect
        for (let i = 0; i < 3; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = i === 0 ? 'square' : 'sawtooth';

            // Rapid frequency jumps for glitchy effect
            const baseFreq = 200 + i * 150;
            osc.frequency.setValueAtTime(baseFreq, now);
            osc.frequency.setValueAtTime(baseFreq * 1.5, now + 0.05);
            osc.frequency.setValueAtTime(baseFreq * 0.5, now + 0.1);
            osc.frequency.setValueAtTime(baseFreq * 2, now + 0.15);
            osc.frequency.setValueAtTime(baseFreq * 0.75, now + 0.2);

            // Detune for dissonance
            osc.detune.value = (i - 1) * 25;

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.setValueAtTime(0.08, now + 0.05);
            gain.gain.setValueAtTime(0.15, now + 0.1);
            gain.gain.setValueAtTime(0.05, now + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

            osc.connect(gain);
            gain.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + 0.35);
        }

        // Add noise burst for digital static
        this.playNoiseBurst(0.15, 0.25);
    }

    // ========================================================================
    // Noise Generator Helper
    // ========================================================================

    playNoiseBurst(volume, duration) {
        if (!this.initialized) return;

        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // Fill with noise, decaying
        for (let i = 0; i < bufferSize; i++) {
            const decay = 1 - (i / bufferSize);
            data[i] = (Math.random() * 2 - 1) * decay;
        }

        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();

        source.buffer = buffer;
        gain.gain.value = volume;

        source.connect(gain);
        gain.connect(this.masterGain);

        source.start(now);
    }
}

// Export singleton
export const audio = new AudioSystem();
