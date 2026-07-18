/**
 * CustomSelect — combobox estilizado reutilizable (Atlas).
 * Adaptado de js/ui/custom-select.js como módulo ES.
 */

export class CustomSelect {
  /**
   * @param {object} options
   * @param {string} [options.id]
   * @param {string} [options.name]
   * @param {string} [options.placeholder]
   * @param {boolean} [options.required]
   * @param {boolean} [options.disabled]
   * @param {{ value: string, text: string, disabled?: boolean, selected?: boolean }[]} [options.options]
   * @param {string} [options.value]
   * @param {string} [options.className]
   * @param {(value: string, event: Event) => void} [options.onChange]
   */
  constructor(options = {}) {
    this.id = options.id || '';
    this.name = options.name || '';
    this.placeholder = options.placeholder || '';
    this.required = options.required || false;
    this.disabled = options.disabled || false;
    this.options = options.options || [];
    this.value = options.value || '';
    this.className = options.className || '';
    this.onChange = options.onChange || null;

    this.container = null;
    this.select = null;
    this.arrow = null;

    this.create();
  }

  create() {
    this.container = document.createElement('div');
    this.container.className = `custom-select ${this.className}`.trim();

    this.select = document.createElement('select');
    this.select.id = this.id;
    this.select.name = this.name;
    this.select.required = this.required;
    this.select.disabled = this.disabled;

    this.populateOptions();

    this.arrow = document.createElement('div');
    this.arrow.className = 'custom-select__arrow';
    this.arrow.setAttribute('aria-hidden', 'true');

    this.container.appendChild(this.select);
    this.container.appendChild(this.arrow);

    if (this.onChange) {
      this.select.addEventListener('change', (e) => {
        this.onChange(e.target.value, e);
      });
    }
  }

  populateOptions() {
    this.select.innerHTML = '';

    if (this.placeholder) {
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = this.placeholder;
      this.select.appendChild(placeholderOption);
    }

    this.options.forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.text;
      optionElement.disabled = option.disabled || false;

      if (option.value === this.value || option.selected) {
        optionElement.selected = true;
      }

      this.select.appendChild(optionElement);
    });
  }

  getElement() {
    return this.container;
  }

  getSelect() {
    return this.select;
  }

  getValue() {
    return this.select.value;
  }

  setValue(value) {
    this.select.value = value;
    this.value = value;
  }

  setDisabled(disabled) {
    this.select.disabled = disabled;
    this.disabled = disabled;
  }

  updateOptions(newOptions) {
    this.options = newOptions;
    this.populateOptions();
  }

  addEventListener(event, callback) {
    this.select.addEventListener(event, callback);
  }

  removeEventListener(event, callback) {
    this.select.removeEventListener(event, callback);
  }

  destroy() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
