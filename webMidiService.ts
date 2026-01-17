
import { WebMidi, Input, Output } from 'webmidi';

export class MidiService {
  private static instance: MidiService;
  public isEnabled: boolean = false;

  private constructor() {}

  static getInstance() {
    if (!MidiService.instance) {
      MidiService.instance = new MidiService();
    }
    return MidiService.instance;
  }

  async init(): Promise<void> {
    try {
      if (WebMidi.enabled) {
        this.isEnabled = true;
        return;
      }
      await WebMidi.enable();
      this.isEnabled = true;
      console.log('WebMidi enabled');
    } catch (err) {
      console.error('WebMidi could not be enabled:', err);
      this.isEnabled = false;
      throw err;
    }
  }

  getInputs(): Input[] {
    if (!WebMidi.enabled) return [];
    return WebMidi.inputs;
  }

  getOutputs(): Output[] {
    if (!WebMidi.enabled) return [];
    return WebMidi.outputs;
  }

  getInputById(id: string): Input | undefined {
    if (!WebMidi.enabled || !id) return undefined;
    try {
      return WebMidi.getInputById(id);
    } catch (e) {
      return undefined;
    }
  }

  getOutputById(id: string): Output | undefined {
    if (!WebMidi.enabled || !id) return undefined;
    try {
      return WebMidi.getOutputById(id);
    } catch (e) {
      return undefined;
    }
  }
}

export const midiService = MidiService.getInstance();
