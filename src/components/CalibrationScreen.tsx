import { useEffect, useRef, useState } from 'react';
import { mlClassifier } from '../lib/mlColorClassifier';
import type { CubeColor } from '../types/cube';

const COLORS: Array<{ id: CubeColor; name: string; hex: string }> = [
  { id: 'R', name: 'Red', hex: '#DC2626' },
  { id: 'O', name: 'Orange', hex: '#F97316' },
  { id: 'Y', name: 'Yellow', hex: '#FACC15' },
  { id: 'G', name: 'Green', hex: '#16A34A' },
  { id: 'B', name: 'Blue', hex: '#2563EB' },
  { id: 'W', name: 'White', hex: '#F9FAFB' },
];

interface Props {
  onComplete: () => void;
}

export function CalibrationScreen({ onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedColor, setSelectedColor] = useState<CubeColor>('R');
  const [samples, setSamples] = useState<Record<CubeColor, number>>({
    R: 0, O: 0, Y: 0, G: 0, B: 0, W: 0,
  });
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState({ epoch: 0, accuracy: 0 });

  // Start camera
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stream: MediaStream;
    
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 1280, height: 720 }
    })
    .then((s) => {
      stream = s;
      video.srcObject = s;
      video.play();
    })
    .catch((err) => {
      console.error('Camera error:', err);
      alert('Cannot access camera. Please check permissions.');
    });

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Draw video feed with crosshair
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const draw = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        // Draw crosshair at center
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const size = 40;

        ctx.strokeStyle = selectedColor ? COLORS.find(c => c.id === selectedColor)!.hex : '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - size, cy);
        ctx.lineTo(cx + size, cy);
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx, cy + size);
        ctx.stroke();

        // Draw sampling box
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 20, cy - 20, 40, 40);
      }
      animationId = requestAnimationFrame(draw);
    };
    draw();

    return () => cancelAnimationFrame(animationId);
  }, [selectedColor, videoRef]);

  const captureSample = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !selectedColor) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get pixel data from center 40x40 region
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const imageData = ctx.getImageData(cx - 20, cy - 20, 40, 40);

    // Calculate average RGB
    let r = 0, g = 0, b = 0;
    const pixels = imageData.data.length / 4;
    for (let i = 0; i < imageData.data.length; i += 4) {
      r += imageData.data[i];
      g += imageData.data[i + 1];
      b += imageData.data[i + 2];
    }
    r = Math.round(r / pixels);
    g = Math.round(g / pixels);
    b = Math.round(b / pixels);

    // Add to training data
    mlClassifier.addTrainingSample(selectedColor, [r, g, b]);
    setSamples(mlClassifier.getTrainingSampleCount());
  };

  const trainModel = async () => {
    const totalSamples = Object.values(samples).reduce((a, b) => a + b, 0);
    if (totalSamples < 30) {
      alert('Need at least 30 total samples (5 per color minimum)');
      return;
    }

    setIsTraining(true);
    try {
      await mlClassifier.train((epoch, accuracy) => {
        setTrainingProgress({ epoch, accuracy });
      });
      alert('✅ Model trained successfully! You can now start scanning.');
      onComplete();
    } catch (error) {
      alert(`❌ Training failed: ${error}`);
    } finally {
      setIsTraining(false);
    }
  };

  const clearSamples = () => {
    mlClassifier.clearTrainingSamples();
    setSamples({ R: 0, O: 0, Y: 0, G: 0, B: 0, W: 0 });
  };

  const totalSamples = Object.values(samples).reduce((a, b) => a + b, 0);
  const canTrain = totalSamples >= 30 && Object.values(samples).every(count => count >= 3);

  return (
    <div className="calibration-screen">
      <div className="calibration-header">
        <h2>🎨 AI Calibration</h2>
        <p>Point camera at each color and capture 5-10 samples per color</p>
      </div>

      <div className="calibration-content">
        <div className="video-container">
          <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
          <canvas ref={canvasRef} className="calibration-canvas" />
          <div className="instructions">
            Position the {COLORS.find(c => c.id === selectedColor)?.name} sticker in the crosshair
          </div>
        </div>

        <div className="calibration-controls">
          <div className="color-selector">
            {COLORS.map(color => (
              <button
                key={color.id}
                className={`color-btn ${selectedColor === color.id ? 'active' : ''}`}
                style={{
                  backgroundColor: color.hex,
                  border: selectedColor === color.id ? '3px solid #fff' : 'none',
                }}
                onClick={() => setSelectedColor(color.id)}
              >
                <span>{color.name}</span>
                <span className="sample-count">{samples[color.id]}</span>
              </button>
            ))}
          </div>

          <button
            className="capture-btn"
            onClick={captureSample}
            disabled={isTraining}
          >
            📸 Capture Sample ({totalSamples})
          </button>

          <div className="action-buttons">
            <button onClick={clearSamples} disabled={isTraining || totalSamples === 0}>
              🗑️ Clear All
            </button>
            <button
              onClick={trainModel}
              disabled={!canTrain || isTraining}
              className="train-btn"
            >
              {isTraining
                ? `Training... ${trainingProgress.epoch}/100 (${(trainingProgress.accuracy * 100).toFixed(1)}%)`
                : `🎓 Train Model`}
            </button>
          </div>

          {!canTrain && totalSamples > 0 && (
            <div className="warning">
              ⚠️ Need at least 30 total samples with 3+ per color
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
