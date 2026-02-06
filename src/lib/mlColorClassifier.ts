import * as tf from '@tensorflow/tfjs';
import type { CubeColor } from '../types/cube';

const COLORS: CubeColor[] = ['R', 'O', 'Y', 'G', 'B', 'W'];
const MODEL_NAME = 'rubiks-color-classifier';

interface TrainingSample {
  color: CubeColor;
  rgb: [number, number, number];
}

export class MLColorClassifier {
  private model: tf.LayersModel | null = null;
  private trainingSamples: TrainingSample[] = [];
  private isTraining = false;

  async initialize(): Promise<void> {
    // Try to load existing model from localStorage
    try {
      this.model = await tf.loadLayersModel(`localstorage://${MODEL_NAME}`);
      console.log('✅ Loaded existing ML color classifier');
      return;
    } catch {
      console.log('⚠️ No existing model found, will need calibration');
    }

    // Create a new untrained model
    this.model = this.createModel();
  }

  private createModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        // Input: RGB values (3 channels)
        tf.layers.dense({ inputShape: [3], units: 32, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        // Output: 6 colors (softmax for probabilities)
        tf.layers.dense({ units: 6, activation: 'softmax' }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  addTrainingSample(color: CubeColor, rgb: [number, number, number]): void {
    this.trainingSamples.push({ color, rgb });
    console.log(
      `📊 Added training sample: ${color} = RGB(${rgb.join(',')}) [Total: ${this.trainingSamples.length}]`
    );
  }

  clearTrainingSamples(): void {
    this.trainingSamples = [];
    console.log('🗑️ Cleared all training samples');
  }

  getTrainingSampleCount(): Record<CubeColor, number> {
    const counts: Record<string, number> = {};
    for (const color of COLORS) {
      counts[color] = this.trainingSamples.filter(s => s.color === color).length;
    }
    return counts as Record<CubeColor, number>;
  }

  async train(onProgress?: (epoch: number, accuracy: number) => void): Promise<void> {
    if (this.trainingSamples.length < 30) {
      throw new Error('Need at least 30 training samples (5 per color)');
    }

    const counts = this.getTrainingSampleCount();
    for (const color of COLORS) {
      if (counts[color] < 3) {
        throw new Error(`Need at least 3 samples for ${color}, only have ${counts[color]}`);
      }
    }

    this.isTraining = true;
    console.log('🎓 Starting model training...');

    // Prepare training data
    const xs: number[][] = [];
    const ys: number[][] = [];

    for (const sample of this.trainingSamples) {
      // Normalize RGB to [0, 1]
      xs.push(sample.rgb.map(v => v / 255));
      
      // One-hot encode the color
      const oneHot = new Array(6).fill(0);
      oneHot[COLORS.indexOf(sample.color)] = 1;
      ys.push(oneHot);
    }

    const xTensor = tf.tensor2d(xs);
    const yTensor = tf.tensor2d(ys);

    try {
      // Train the model
      const history = await this.model!.fit(xTensor, yTensor, {
        epochs: 100,
        batchSize: 8,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 10 === 0) {
              console.log(`Epoch ${epoch}: accuracy=${logs?.acc?.toFixed(4)}`);
              if (onProgress) {
                onProgress(epoch, logs?.acc || 0);
              }
            }
          },
        },
      });

      // Save the trained model
      await this.model!.save(`localstorage://${MODEL_NAME}`);
      console.log('✅ Model trained and saved!');

      const finalAcc = history.history.acc[history.history.acc.length - 1] as number;
      console.log(`Final training accuracy: ${(finalAcc * 100).toFixed(1)}%`);
    } finally {
      xTensor.dispose();
      yTensor.dispose();
      this.isTraining = false;
    }
  }

  classify(rgb: [number, number, number]): { color: CubeColor; confidence: number } {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    // Normalize input
    const normalized = rgb.map(v => v / 255);
    const input = tf.tensor2d([normalized]);

    try {
      const prediction = this.model.predict(input) as tf.Tensor;
      const probabilities = prediction.dataSync();
      
      // Find the color with highest probability
      let maxProb = 0;
      let maxIndex = 0;
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIndex = i;
        }
      }

      const color = COLORS[maxIndex];
      
      prediction.dispose();
      
      return { color, confidence: maxProb };
    } finally {
      input.dispose();
    }
  }

  async deleteModel(): Promise<void> {
    try {
      await tf.io.removeModel(`localstorage://${MODEL_NAME}`);
      this.model = this.createModel();
      console.log('🗑️ Deleted saved model');
    } catch (e) {
      console.warn('Could not delete model:', e);
    }
  }

  isReady(): boolean {
    return this.model !== null && !this.isTraining;
  }

  needsCalibration(): boolean {
    // Check if we have a trained model
    return this.model === null || this.trainingSamples.length === 0;
  }
}

// Singleton instance
export const mlClassifier = new MLColorClassifier();
