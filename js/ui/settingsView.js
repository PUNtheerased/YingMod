/** Two-way binding between [data-setting] inputs and the Settings store. */
export class SettingsView {
  constructor(root, settings) {
    this.settings = settings;
    this.inputs = [...root.querySelectorAll("[data-setting]")];
    for (const input of this.inputs) {
      const ev = input.type === "range" ? "input" : "change";
      input.addEventListener(ev, () => {
        const path = input.dataset.setting;
        const value = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
        settings.set(path, value);
      });
    }
    settings.on("change", () => this.refresh());
    this.refresh();
  }

  refresh() {
    for (const input of this.inputs) {
      const v = this.settings.get(input.dataset.setting);
      if (input.type === "checkbox") input.checked = !!v;
      else input.value = String(v);
      if (input.type === "range") input.title = String(v);
    }
  }
}
