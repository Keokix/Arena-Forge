/** Round lifecycle is independent of rendering, pointer lock and menus. */
export class Match {
  constructor({ mode = 'elimination', enemyCount = 8, difficulty = 'normal' } = {}) {
    this.mode = mode === 'survival' ? 'survival' : 'elimination';
    this.difficulty = difficulty;
    this.baseEnemies = Math.max(4, Math.min(24, Number(enemyCount) || 8));
    this.phase = 'ready';
    this.elapsed = 0;
    this.wave = 1;
    this.totalWaves = this.mode === 'survival' ? 5 : 1;
    this.timeLimit = this.mode === 'survival' ? 900 : 420;
    this.lives = 3;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTime = 0;
    this.waveDelay = 0;
    this.total = this.baseEnemies;
    this.alive = this.total;
  }
  start() {
    if (this.phase === 'ready') this.phase = 'active';
  }
  tick(delta, alive) {
    if (this.phase !== 'active') return null;
    this.elapsed += delta;
    this.comboTime = Math.max(0, this.comboTime - delta);
    if (!this.comboTime) this.combo = 0;
    this.alive = alive;
    if (this.elapsed >= this.timeLimit) {
      this.phase = 'defeat';
      return 'defeat';
    }
    if (alive > 0) { this.waveDelay = 0; return null; }
    if (this.wave >= this.totalWaves) {
      this.phase = 'victory';
      this.score += Math.round((this.timeLimit - this.elapsed) * 2) + this.lives * 200;
      return 'victory';
    }
    this.waveDelay += delta;
    if (this.waveDelay < 4) return null;
    this.wave++;
    this.waveDelay = 0;
    this.total = Math.min(24, this.baseEnemies + (this.wave - 1) * 2);
    this.alive = this.total;
    this.score += 200;
    return 'wave';
  }
  kill(headshot = false) {
    if (this.phase !== 'active') return;
    this.combo++;
    this.comboTime = 4;
    this.kills++;
    this.score += 100 + (headshot ? 50 : 0) + Math.min(100, Math.max(0, this.combo - 1) * 20);
  }
  die() {
    if (this.phase !== 'active') return false;
    this.lives--;
    this.combo = 0;
    this.score = Math.max(0, this.score - 100);
    if (this.lives <= 0) this.phase = 'defeat';
    return this.lives > 0;
  }
  snapshot() {
    return { mode: this.mode, phase: this.phase, wave: this.wave, totalWaves: this.totalWaves, timeRemaining: Math.max(0, Math.ceil(this.timeLimit - this.elapsed)), elapsed: Math.floor(this.elapsed), kills: this.kills, score: this.score, lives: this.lives, alive: this.alive, total: this.total, combo: this.combo, waveDelay: this.alive === 0 && this.wave < this.totalWaves ? Math.max(0, Math.ceil(4 - this.waveDelay)) : 0 };
  }
}
