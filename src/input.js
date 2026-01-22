/**
 * Input handling for Void Artillery
 * Tracks keyboard state and provides clean interface for game logic
 */

class Input {
    constructor() {
        // Current state of all keys
        this.keys = {};
        
        // Keys that were just pressed this frame
        this.justPressed = {};
        
        // Keys that were just released this frame
        this.justReleased = {};
        
        // Mouse state
        this.mouse = {
            x: 0,
            y: 0,
            down: false,
            justPressed: false,
            justReleased: false
        };
        
        // Bind event listeners
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        
        // Attach listeners
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('mousemove', this._onMouseMove);
        window.addEventListener('mousedown', this._onMouseDown);
        window.addEventListener('mouseup', this._onMouseUp);
    }
    
    _onKeyDown(e) {
        // Prevent default for game keys (arrow keys, space)
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
            e.preventDefault();
        }
        
        if (!this.keys[e.code]) {
            this.justPressed[e.code] = true;
        }
        this.keys[e.code] = true;
    }
    
    _onKeyUp(e) {
        this.keys[e.code] = false;
        this.justReleased[e.code] = true;
    }
    
    _onMouseMove(e) {
        // Get position relative to canvas
        const canvas = document.getElementById('game');
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
    }
    
    _onMouseDown(e) {
        this.mouse.down = true;
        this.mouse.justPressed = true;
    }
    
    _onMouseUp(e) {
        this.mouse.down = false;
        this.mouse.justReleased = true;
    }
    
    // Call at end of each frame to reset "just" states
    endFrame() {
        this.justPressed = {};
        this.justReleased = {};
        this.mouse.justPressed = false;
        this.mouse.justReleased = false;
    }
    
    // Convenience methods
    isDown(code) {
        return !!this.keys[code];
    }
    
    wasPressed(code) {
        return !!this.justPressed[code];
    }
    
    wasReleased(code) {
        return !!this.justReleased[code];
    }
    
    // Common key checks
    get left() { return this.isDown('ArrowLeft') || this.isDown('KeyA'); }
    get right() { return this.isDown('ArrowRight') || this.isDown('KeyD'); }
    get up() { return this.isDown('ArrowUp') || this.isDown('KeyW'); }
    get down() { return this.isDown('ArrowDown') || this.isDown('KeyS'); }
    get space() { return this.isDown('Space'); }
    get spacePressed() { return this.wasPressed('Space'); }
    get spaceReleased() { return this.wasReleased('Space'); }
    get enter() { return this.wasPressed('Enter'); }
    get escape() { return this.wasPressed('Escape'); }
    
    // Cleanup
    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('mousemove', this._onMouseMove);
        window.removeEventListener('mousedown', this._onMouseDown);
        window.removeEventListener('mouseup', this._onMouseUp);
    }
}

// Export singleton instance
export const input = new Input();
