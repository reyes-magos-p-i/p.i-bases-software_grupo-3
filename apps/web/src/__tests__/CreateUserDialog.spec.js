import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import CreateUserDialog from '@/components/users/CreateUserDialog.vue';
const provinces = [
    { id: 1, label: 'Provincia A' },
    { id: 2, label: 'Provincia B' },
];
const cantons = [
    { id: 11, label: 'Cantón A1', provinceId: 1 },
    { id: 12, label: 'Cantón A2', provinceId: 1 },
    { id: 21, label: 'Cantón B1', provinceId: 2 },
];
const districts = [
    { id: 111, label: 'Distrito A1', cantonId: 11 },
    { id: 121, label: 'Distrito A2', cantonId: 12 },
    { id: 211, label: 'Distrito B1', cantonId: 21 },
];
let wrapper;
let opener;
let originalRootStyle;
let originalBodyStyle;
const dialogPrototype = HTMLDialogElement.prototype;
const originalShowModal = Object.getOwnPropertyDescriptor(dialogPrototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, 'close');
beforeEach(() => {
    originalRootStyle = document.documentElement.getAttribute('style');
    originalBodyStyle = document.body.getAttribute('style');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => { });
    opener = document.createElement('button');
    opener.textContent = 'Añadir empleado';
    document.body.append(opener);
    // jsdom does not implement the native dialog methods.
    Object.defineProperties(dialogPrototype, {
        showModal: {
            configurable: true,
            value: vi.fn(function () {
                this.setAttribute('open', '');
            }),
        },
        close: {
            configurable: true,
            value: vi.fn(function () {
                if (!this.open)
                    return;
                this.removeAttribute('open');
                this.dispatchEvent(new Event('close'));
            }),
        },
    });
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    for (const [name, descriptor] of [
        ['showModal', originalShowModal],
        ['close', originalClose],
    ]) {
        if (descriptor)
            Object.defineProperty(dialogPrototype, name, descriptor);
        else
            Reflect.deleteProperty(dialogPrototype, name);
    }
    document.body.innerHTML = '';
    for (const [element, style] of [
        [document.documentElement, originalRootStyle],
        [document.body, originalBodyStyle],
    ]) {
        if (style === null)
            element.removeAttribute('style');
        else
            element.setAttribute('style', style);
    }
    vi.restoreAllMocks();
});
async function renderDialog(props = {}) {
    wrapper = mount(CreateUserDialog, { props, attachTo: document.body });
    opener.focus();
    wrapper.vm.open();
    await nextTick();
    return wrapper;
}
describe('client form', () => {
    async function filledClient(props = {}) {
        const view = await renderDialog({ mode: 'client', ...props });
        await view.get('[name="firstName"]').setValue('Ana');
        await view.get('[name="email"]').setValue('ana@example.com');
        return view;
    }
    it('requires only name and email and hides employee and public registration fields', async () => {
        const view = await renderDialog({ mode: 'client' });
        expect(view.get('h2').text()).toBe('Crear cliente');
        expect(view.findAll('[required]').map((field) => field.attributes('name'))).toEqual([
            'firstName',
            'email',
        ]);
        expect(view.findAll('label .required-marker')).toHaveLength(2);
        for (const name of ['role', 'branchId', 'password', 'gender', 'acceptedTerms', 'districtId']) {
            expect(view.find('[name="' + name + '"]').exists()).toBe(false);
        }
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toBeUndefined();
        expect(view.findAll('[aria-invalid="true"]')).toHaveLength(2);
        expect(document.activeElement).toBe(view.get('[name="firstName"]').element);
    });
    it.each([{}, { catalogsLoading: true }, { catalogsError: 'Sin conexión' }])('creates a minimal client without depending on catalogs: %p', async (props) => {
        const view = await filledClient(props);
        expect(view.get('.create-button').attributes('disabled')).toBeUndefined();
        await view.get('form').trigger('submit');
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toEqual([
            [
                {
                    role: 'CLIENT',
                    firstName: 'Ana',
                    email: 'ana@example.com',
                    language: 'es',
                },
            ],
        ]);
    });
    it('submits optional data and a nested address without a branch', async () => {
        const view = await filledClient({ provinces, cantons, districts });
        await view.get('[type="checkbox"]').setValue(true);
        for (const [name, value] of Object.entries({
            secondName: 'María',
            firstSurname: 'Solano',
            secondSurname: 'Rojas',
            birthday: '2000-02-29',
            phoneNumber: '+506 8888-8888',
            language: 'en',
            provinceId: '1',
            cantonId: '11',
            districtId: '111',
            details: 'Casa azul',
        }))
            await view.get('[name="' + name + '"]').setValue(value);
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toEqual([
            [
                {
                    role: 'CLIENT',
                    firstName: 'Ana',
                    secondName: 'María',
                    firstSurname: 'Solano',
                    secondSurname: 'Rojas',
                    email: 'ana@example.com',
                    birthday: '2000-02-29',
                    phoneNumber: '+506 8888-8888',
                    language: 'en',
                    address: { districtId: 111, details: 'Casa azul' },
                },
            ],
        ]);
        view.vm.complete();
        await nextTick();
        view.vm.open();
        expect(view.get('[name="firstName"]').element).toHaveProperty('value', '');
        expect(view.get('[name="language"]').element).toHaveProperty('value', 'es');
        expect(view.get('[type="checkbox"]').element).toHaveProperty('checked', false);
        expect(view.find('[name="provinceId"]').exists()).toBe(false);
    });
    it('requires a complete address when enabled and clears descendants on geography changes', async () => {
        const view = await filledClient({ provinces, cantons, districts });
        await view.get('[type="checkbox"]').setValue(true);
        await view.get('[name="provinceId"]').setValue('1');
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toBeUndefined();
        expect(view.get('[name="cantonId"]').attributes('aria-invalid')).toBe('true');
        await view.get('[name="cantonId"]').setValue('11');
        await view.get('[name="districtId"]').setValue('111');
        await view.get('[name="provinceId"]').setValue('2');
        expect(view.get('[name="cantonId"]').element).toHaveProperty('value', '');
        expect(view.get('[name="districtId"]').element).toHaveProperty('value', '');
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toBeUndefined();
        await view.get('[name="cantonId"]').setValue('21');
        await view.get('[name="districtId"]').setValue('211');
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')?.[0]?.[0]).toHaveProperty('address', { districtId: 211 });
    });
    it('does not send an address that has been deselected, including invalid hidden details', async () => {
        const view = await filledClient({ provinces, cantons, districts });
        await view.get('[type="checkbox"]').setValue(true);
        await view.get('[name="provinceId"]').setValue('1');
        await view.get('[name="cantonId"]').setValue('11');
        await view.get('[name="districtId"]').setValue('111');
        await view.get('[name="details"]').setValue('á'.repeat(128));
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toBeUndefined();
        await view.get('[type="checkbox"]').setValue(false);
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')?.[0]?.[0]).not.toHaveProperty('address');
    });
    it.each([{ catalogsLoading: true }, { catalogsError: 'Sin conexión' }, { provinces: [] }])('blocks an enabled address when catalogs are unavailable: %p', async (props) => {
        const view = await filledClient(props);
        await view.get('[type="checkbox"]').setValue(true);
        expect(view.get('.create-button').attributes('disabled')).toBeDefined();
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toBeUndefined();
        await view.get('[type="checkbox"]').setValue(false);
        expect(view.get('.create-button').attributes('disabled')).toBeUndefined();
    });
    it.each([
        ['email', 'ana@'],
        ['firstSurname', 'á'.repeat(51)],
        ['secondName', 'a'.repeat(101)],
        ['secondSurname', 'a'.repeat(101)],
        ['phoneNumber', '1'.repeat(21)],
    ])('validates %s on blur and accepts its correction', async (name, value) => {
        const view = await filledClient();
        const field = view.get('[name="' + name + '"]');
        await field.setValue(value);
        await field.trigger('focusout');
        expect(field.attributes('aria-invalid')).toBe('true');
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toBeUndefined();
        await field.setValue(name === 'email' ? 'ana@example.com' : '');
        expect(field.attributes('aria-invalid')).toBe('false');
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toHaveLength(1);
    });
    it('rejects partially entered dates while allowing an omitted birthday', async () => {
        const view = await filledClient();
        const field = view.get('[name="birthday"]');
        vi.spyOn(field.element.validity, 'badInput', 'get').mockReturnValue(true);
        await view.get('form').trigger('submit');
        expect(field.attributes('aria-invalid')).toBe('true');
        expect(view.emitted('submit')).toBeUndefined();
        vi.restoreAllMocks();
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')?.[0]?.[0]).not.toHaveProperty('birthday');
    });
});
describe('CreateUserDialog', () => {
    it('opens a labelled modal and focuses the first field without opening twice', async () => {
        const view = await renderDialog();
        const dialog = view.get('dialog');
        expect(dialog.element.open).toBe(true);
        expect(dialog.attributes('aria-labelledby')).toBe(view.get('h2').attributes('id'));
        expect(view.get('h2').text()).toBe('Crear empleado');
        expect(document.activeElement).toBe(view.get('[name="firstName"]').element);
        view.vm.open();
        expect(dialog.element.showModal).toHaveBeenCalledOnce();
    });
    it('locks the page at its current position and restores existing styles and scroll on close', async () => {
        document.documentElement.style.setProperty('overflow-y', 'scroll', 'important');
        document.documentElement.style.setProperty('scrollbar-gutter', 'stable both-edges');
        document.body.style.setProperty('position', 'relative');
        document.body.style.setProperty('top', '2px');
        document.body.style.setProperty('left', '3px');
        document.body.style.setProperty('right', '4px');
        document.body.style.setProperty('overflow-x', 'clip');
        document.body.style.setProperty('color', 'red');
        const rootStyle = document.documentElement.style.cssText;
        const bodyStyle = document.body.style.cssText;
        const scrollX = vi.spyOn(window, 'scrollX', 'get').mockReturnValue(12);
        const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(360);
        const view = await renderDialog();
        expect(document.documentElement.style.overflowY).toBe('hidden');
        expect(document.body.style.position).toBe('fixed');
        expect(document.body.style.top).toBe('-360px');
        expect(document.body.style.left).toBe('-12px');
        expect(document.body.style.overflowY).toBe('hidden');
        scrollX.mockReturnValue(0);
        scrollY.mockReturnValue(0);
        // Opening an already open dialog must not replace its saved page position.
        view.vm.open();
        const focus = vi.spyOn(opener, 'focus');
        await view.get('.cancel-button').trigger('click');
        expect(document.documentElement.style.cssText).toBe(rootStyle);
        expect(document.body.style.cssText).toBe(bodyStyle);
        expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({
            left: 12,
            top: 360,
            behavior: 'instant',
        });
        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });
    it('releases and reapplies the lock on reopening without accepting a stale close event', async () => {
        const view = await renderDialog();
        await view.get('.close-button').trigger('click');
        expect(document.body.style.position).toBe('');
        view.vm.open();
        await view.get('dialog').trigger('close');
        expect(view.get('dialog').element.open).toBe(true);
        expect(document.body.style.position).toBe('fixed');
        await view.get('.cancel-button').trigger('click');
        expect(document.body.style.position).toBe('');
        expect(document.documentElement.style.overflowY).toBe('');
    });
    it('restores scrolling if the native modal fails to open', () => {
        wrapper = mount(CreateUserDialog, { attachTo: document.body });
        vi.mocked(dialogPrototype.showModal).mockImplementationOnce(() => {
            throw new Error('Cannot open dialog');
        });
        expect(() => wrapper?.vm.open()).toThrow('Cannot open dialog');
        expect(document.body.style.position).toBe('');
        expect(document.documentElement.style.overflowY).toBe('');
    });
    it('does not change page styles when an unopened dialog is removed', () => {
        document.body.style.position = 'relative';
        wrapper = mount(CreateUserDialog, { attachTo: document.body });
        wrapper.unmount();
        expect(document.body.style.position).toBe('relative');
        expect(window.scrollTo).not.toHaveBeenCalled();
    });
    it('labels required fields with an asterisk and leaves second name and address details optional', async () => {
        const view = await renderDialog();
        const required = [
            'firstName',
            'firstSurname',
            'secondSurname',
            'birthday',
            'email',
            'phoneNumber',
            'role',
            'provinceId',
            'cantonId',
            'districtId',
            'branchId',
        ];
        expect(view.findAll('input, select, textarea')).toHaveLength(13);
        for (const name of required) {
            const field = view.get('[name="' + name + '"]');
            expect(field.attributes('required')).toBeDefined();
            const label = view.get('label[for="' + field.attributes('id') + '"]');
            expect(label.get('.required-marker').text()).toBe('*');
            expect(label.get('.required-marker').attributes('aria-hidden')).toBe('true');
        }
        expect(view.get('[name="secondName"]').attributes('required')).toBeUndefined();
        expect(view.get('[name="details"]').attributes('required')).toBeUndefined();
        expect(view.find('[name="addressId"]').exists()).toBe(false);
        expect(view.get('[name="birthday"]').attributes('type')).toBe('date');
        expect(view.get('[name="email"]').attributes('type')).toBe('email');
        expect(view.get('[name="phoneNumber"]').attributes('type')).toBe('tel');
        expect(view.find('input[type="password"]').exists()).toBe(false);
        expect(view.text()).not.toContain('cédula');
        expect(view.text()).toContain('El sistema generará la contraseña inicial');
    });
    it('allows employee and administrator roles with a corresponding dialog title', async () => {
        const view = await renderDialog();
        const role = view.get('select[name="role"]');
        expect(role.findAll('option').map((option) => option.attributes('value'))).toEqual([
            'EMPLOYEE',
            'ADMINISTRATOR',
        ]);
        await role.setValue('ADMINISTRATOR');
        expect(view.get('h2').text()).toBe('Crear administrador');
        await role.setValue('EMPLOYEE');
        expect(view.get('h2').text()).toBe('Crear empleado');
    });
    it('explains empty catalogs without inventing selectable records', async () => {
        const view = await renderDialog();
        for (const name of ['provinceId', 'branchId']) {
            const select = view.get('select[name="' + name + '"]');
            expect(select.attributes('disabled')).toBeDefined();
            expect(select.findAll('option')).toHaveLength(1);
            expect(select.get('option').attributes('value')).toBe('');
            expect(select.get('option').attributes('disabled')).toBeDefined();
            expect(view.get('[id="' + select.attributes('aria-describedby') + '"]').text()).toContain('disponibles');
        }
        for (const name of ['cantonId', 'districtId']) {
            const select = view.get('[name="' + name + '"]');
            expect(select.attributes('disabled')).toBeDefined();
            expect(select.findAll('option')).toHaveLength(1);
            expect(view.get('[id="' + select.attributes('aria-describedby') + '"]').text()).toContain('primero');
        }
    });
    it('accepts labelled catalog entries and preserves the selected identifiers', async () => {
        const view = await renderDialog({
            provinces,
            cantons,
            districts,
            branches: [{ id: 7, label: 'Sucursal de prueba' }],
        });
        const province = view.get('[name="provinceId"]');
        const canton = view.get('[name="cantonId"]');
        const district = view.get('[name="districtId"]');
        const branch = view.get('[name="branchId"]');
        expect(province.attributes('disabled')).toBeUndefined();
        expect(branch.attributes('disabled')).toBeUndefined();
        expect(province.get('option[value="1"]').text()).toBe('Provincia A');
        expect(branch.get('option[value="7"]').text()).toBe('Sucursal de prueba');
        await province.setValue('1');
        await canton.setValue('11');
        await district.setValue('111');
        await branch.setValue('7');
        await view.get('.cancel-button').trigger('click');
        view.vm.open();
        expect(province.element.value).toBe('1');
        expect(canton.element.value).toBe('11');
        expect(district.element.value).toBe('111');
        expect(branch.element.value).toBe('7');
        expect(canton.attributes('aria-describedby')).toBeUndefined();
        expect(district.attributes('aria-describedby')).toBeUndefined();
        expect(view.get('[type="submit"]').attributes('disabled')).toBeUndefined();
    });
    it.each(['cancel', 'close-button', 'escape', 'native-close'])('closes through %s and returns focus to the opener', async (method) => {
        const view = await renderDialog();
        const dialog = view.get('dialog');
        if (method === 'cancel')
            await view.get('.cancel-button').trigger('click');
        if (method === 'close-button')
            await view.get('.close-button').trigger('click');
        if (method === 'escape')
            await dialog.trigger('cancel');
        if (method === 'native-close')
            dialog.element.close();
        expect(dialog.element.open).toBe(false);
        expect(document.activeElement).toBe(opener);
        expect(document.body.style.position).toBe('');
        expect(document.documentElement.style.overflowY).toBe('');
    });
    it('keeps the local draft when reopened and does not dismiss on a backdrop click', async () => {
        const view = await renderDialog();
        await view.get('[name="firstName"]').setValue('Ana');
        await view.get('[name="email"]').setValue('ana@example.com');
        await view.get('[name="role"]').setValue('ADMINISTRATOR');
        await view.get('dialog').trigger('click');
        expect(view.get('dialog').element.open).toBe(true);
        await view.get('.close-button').trigger('click');
        view.vm.open();
        expect(view.get('[name="firstName"]').element.value).toBe('Ana');
        expect(view.get('[name="email"]').element.value).toBe('ana@example.com');
        expect(view.get('h2').text()).toBe('Crear administrador');
    });
    it('wraps keyboard focus around the enabled controls and leaves interior navigation to the browser', async () => {
        const view = await renderDialog();
        const first = view.get('.close-button');
        const last = view.get('.cancel-button');
        first.element.focus();
        await first.trigger('keydown', { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last.element);
        await last.trigger('keydown', { key: 'Tab' });
        expect(document.activeElement).toBe(first.element);
        const input = view.get('[name="firstName"]');
        input.element.focus();
        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        input.element.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
    });
    it('prevents submission when required catalog selections are unavailable', async () => {
        const view = await renderDialog();
        const submit = view.get('[type="submit"]');
        const event = new Event('submit', { bubbles: true, cancelable: true });
        view.get('form').element.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(submit.attributes('disabled')).toBeDefined();
        expect(view.text()).toContain('Sin sucursales disponibles');
        expect(view.emitted('submit')).toBeUndefined();
        expect(view.get('dialog').element.open).toBe(true);
    });
    it('validates all fields on submission and focuses the first invalid input', async () => {
        const view = await renderDialog({
            provinces,
            cantons,
            districts,
            branches: [{ id: 1, label: 'Sucursal' }],
        });
        await view.get('form').trigger('submit');
        await nextTick();
        expect(view.emitted('submit')).toBeUndefined();
        expect(view.findAll('[aria-invalid="true"]').length).toBeGreaterThan(1);
        expect(document.activeElement).toBe(view.get('[name="firstName"]').element);
        await view.get('[name="firstName"]').setValue('Ana');
        expect(view.get('[name="firstName"]').attributes('aria-invalid')).toBe('false');
    });
    it('emits only API fields with nested address and blocks an immediate second submission', async () => {
        const view = await renderDialog({
            provinces,
            cantons,
            districts,
            branches: [{ id: 1, label: 'Sucursal' }],
        });
        for (const [field, value] of Object.entries({
            firstName: 'Ana',
            secondName: 'María',
            firstSurname: 'Solano',
            secondSurname: 'Rojas',
            email: 'ana@example.com',
            birthday: '2000-02-29',
            phoneNumber: '88888888',
            role: 'ADMINISTRATOR',
            branchId: '1',
            provinceId: '1',
            cantonId: '11',
            districtId: '111',
            details: 'Casa azul',
        })) {
            await view.get('[name="' + field + '"]').setValue(value);
        }
        await view.get('form').trigger('submit');
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toEqual([
            [
                {
                    firstName: 'Ana',
                    secondName: 'María',
                    firstSurname: 'Solano',
                    secondSurname: 'Rojas',
                    email: 'ana@example.com',
                    birthday: '2000-02-29',
                    phoneNumber: '88888888',
                    role: 'ADMINISTRATOR',
                    branchId: 1,
                    address: { districtId: 111, details: 'Casa azul' },
                },
            ],
        ]);
        expect(view.get('.create-button').attributes('disabled')).toBeDefined();
        await view.setProps({ submitting: true });
        await view.setProps({ submitting: false, submissionErrors: ['Revisa el correo.'] });
        await nextTick();
        expect(document.activeElement).toBe(view.get('[role="alert"]').element);
        expect(view.get('[name="firstName"]').element.value).toBe('Ana');
    });
    it.each([{ submitting: true }, { submissionBlocked: true }, { catalogsLoading: true }])('does not emit a creation with state %p', async (props) => {
        const view = await renderDialog(props);
        await view.get('form').trigger('submit');
        expect(view.emitted('submit')).toBeUndefined();
    });
    it('releases the native modal when the component is removed', async () => {
        const view = await renderDialog();
        const dialog = view.get('dialog').element;
        view.unmount();
        expect(dialog.open).toBe(false);
        expect(document.body.style.position).toBe('');
        expect(document.documentElement.style.overflowY).toBe('');
    });
    it('filters cantons and districts and clears dependent selections when a parent changes', async () => {
        const view = await renderDialog({ provinces, cantons, districts });
        const province = view.get('[name="provinceId"]');
        const canton = view.get('[name="cantonId"]');
        const district = view.get('[name="districtId"]');
        await view.get('[name="details"]').setValue('Casa de prueba');
        await province.setValue('1');
        expect(canton.findAll('option').map((option) => option.attributes('value'))).toEqual([
            '',
            '11',
            '12',
        ]);
        await canton.setValue('11');
        expect(district.findAll('option').map((option) => option.attributes('value'))).toEqual([
            '',
            '111',
        ]);
        await district.setValue('111');
        await canton.setValue('12');
        expect(district.element.value).toBe('');
        expect(district.findAll('option').map((option) => option.attributes('value'))).toEqual([
            '',
            '121',
        ]);
        await district.setValue('121');
        await province.setValue('2');
        expect(canton.element.value).toBe('');
        expect(district.element.value).toBe('');
        expect(district.attributes('disabled')).toBeDefined();
        expect(canton.findAll('option').map((option) => option.attributes('value'))).toEqual(['', '21']);
        expect(view.get('[name="details"]').element.value).toBe('Casa de prueba');
        expect(view.find('.field-error').exists()).toBe(false);
    });
    it('explains when a selected province or canton has no catalog entries', async () => {
        const view = await renderDialog({ provinces });
        const canton = view.get('[name="cantonId"]');
        const district = view.get('[name="districtId"]');
        await view.get('[name="provinceId"]').setValue('1');
        expect(canton.attributes('disabled')).toBeDefined();
        expect(view.text()).toContain('No hay cantones disponibles para esta provincia.');
        await view.setProps({ cantons });
        expect(canton.attributes('disabled')).toBeUndefined();
        await canton.setValue('11');
        expect(district.attributes('disabled')).toBeDefined();
        expect(view.text()).toContain('No hay distritos disponibles para este cantón.');
        await view.setProps({ districts });
        expect(district.attributes('disabled')).toBeUndefined();
    });
    it('keeps untouched fields quiet and validates an edited email on blur, then as it is corrected', async () => {
        const view = await renderDialog();
        const email = view.get('[name="email"]');
        await view.get('[name="firstName"]').trigger('focusout');
        expect(view.find('.field-error').exists()).toBe(false);
        await email.setValue('correo-invalido');
        expect(email.attributes('aria-invalid')).toBe('false');
        await email.trigger('focusout');
        expect(email.attributes('aria-invalid')).toBe('true');
        const errorId = email.attributes('aria-describedby');
        expect(view.get('[id="' + errorId + '"]').text()).toContain('Introduce un correo electrónico válido');
        expect(view.get('[id="' + errorId + '"]').attributes('aria-live')).toBe('polite');
        await email.setValue('ana@example.com');
        expect(email.attributes('aria-invalid')).toBe('false');
        expect(email.attributes('aria-describedby')).toBeUndefined();
        await email.setValue('');
        expect(email.attributes('aria-invalid')).toBe('true');
        expect(view.text()).toContain('Este campo es obligatorio.');
    });
    it.each([
        'ana@',
        'ana@example',
        'ana@example.c',
        'ana@example.123',
        'ana@@example.com',
        'ana..solano@example.com',
        '.ana@example.com',
        'ana.@example.com',
        'a'.repeat(65) + '@example.com',
    ])('reports malformed email %s', async (value) => {
        const view = await renderDialog();
        const email = view.get('[name="email"]');
        await email.setValue(value);
        await email.trigger('focusout');
        expect(email.attributes('aria-invalid')).toBe('true');
        expect(view.text()).toContain('Introduce un correo electrónico válido');
    });
    it.each(['firstName', 'firstSurname', 'secondSurname', 'phoneNumber'])('requires nonblank text for %s and clears its error on correction', async (name) => {
        const view = await renderDialog();
        const field = view.get('[name="' + name + '"]');
        await field.setValue('   ');
        await field.trigger('focusout');
        expect(field.attributes('aria-invalid')).toBe('true');
        await field.setValue(name === 'phoneNumber' ? '+506 8888-8888' : 'Ana María');
        expect(field.attributes('aria-invalid')).toBe('false');
    });
    it.each([
        ['firstName', 100],
        ['secondName', 100],
        ['firstSurname', 100],
        ['secondSurname', 100],
        ['phoneNumber', 20],
        ['details', 255],
    ])('checks the UTF-8 limit for %s without confusing bytes with characters', async (name, limit) => {
        const view = await renderDialog();
        const field = view.get('[name="' + name + '"]');
        const boundary = 'é'.repeat(Math.floor(limit / 2)) + 'a'.repeat(limit % 2);
        await field.setValue(boundary);
        await field.trigger('focusout');
        expect(field.attributes('aria-invalid')).toBe('false');
        await field.setValue(boundary + 'a');
        expect(field.attributes('aria-invalid')).toBe('true');
        expect(view.text()).toContain('El texto es demasiado largo.');
        await field.setValue(boundary);
        expect(field.attributes('aria-invalid')).toBe('false');
    });
    it('checks the email byte limit as well as its format', async () => {
        const view = await renderDialog();
        const email = view.get('[name="email"]');
        const prefix = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.';
        await email.setValue(prefix + 'c'.repeat(17) + '.com');
        await email.trigger('focusout');
        expect(email.attributes('aria-invalid')).toBe('false');
        await email.setValue(prefix + 'c'.repeat(18) + '.com');
        expect(email.attributes('aria-invalid')).toBe('true');
        expect(view.text()).toContain('El texto es demasiado largo.');
    });
    it('rejects malformed Unicode and allows optional text to be cleared', async () => {
        const view = await renderDialog();
        for (const name of ['secondName', 'details']) {
            const field = view.get('[name="' + name + '"]');
            await field.setValue('\uD800');
            await field.trigger('focusout');
            expect(field.attributes('aria-invalid')).toBe('true');
            expect(view.text()).toContain('El texto contiene un carácter no válido.');
            await field.setValue('');
            expect(field.attributes('aria-invalid')).toBe('false');
        }
        expect(view.get('[name="details"]').attributes('aria-describedby')).toContain('-details-help');
    });
    it('validates dates without imposing an age or a past-date rule', async () => {
        const view = await renderDialog();
        const birthday = view.get('[name="birthday"]');
        await birthday.setValue('10000-01-01');
        await birthday.trigger('focusout');
        expect(birthday.attributes('aria-invalid')).toBe('true');
        expect(view.text()).toContain('Introduce una fecha válida.');
        await birthday.setValue('2000-02-29');
        expect(birthday.attributes('aria-invalid')).toBe('false');
        await birthday.setValue('2099-01-01');
        expect(birthday.attributes('aria-invalid')).toBe('false');
        await birthday.setValue('');
        expect(birthday.attributes('aria-invalid')).toBe('true');
    });
    it('announces a partially entered native date as invalid', async () => {
        const view = await renderDialog();
        const birthday = view.get('[name="birthday"]');
        const validity = vi.spyOn(birthday.element, 'validity', 'get').mockReturnValue({
            ...birthday.element.validity,
            badInput: true,
        });
        await birthday.trigger('input');
        await birthday.trigger('focusout');
        expect(birthday.attributes('aria-invalid')).toBe('true');
        expect(view.text()).toContain('Introduce una fecha válida.');
        validity.mockRestore();
    });
    it('announces catalog loading without disabling personal fields or showing empty-state messages', async () => {
        const view = await renderDialog({ catalogsLoading: true });
        expect(view.get('[role="status"]').text()).toContain('Cargando sucursales');
        expect(view.text()).not.toContain('Sin provincias disponibles');
        expect(view.text()).not.toContain('Todavía no hay sucursales');
        for (const name of ['branchId', 'provinceId', 'cantonId', 'districtId']) {
            expect(view.get('[name="' + name + '"]').attributes('disabled')).toBeDefined();
        }
        await view.get('[name="firstName"]').setValue('Ana');
        expect(view.get('[name="firstName"]').element.value).toBe('Ana');
        expect(view.get('[name="firstName"]').attributes('disabled')).toBeUndefined();
    });
    it('emits retry and retains personal data and focus as catalogs become available', async () => {
        const view = await renderDialog({ catalogsError: 'No se pudieron cargar las opciones.' });
        expect(view.get('[role="alert"]').text()).toContain('No se pudieron cargar');
        await view.get('[name="firstName"]').setValue('Ana');
        await view.get('.catalog-notice button').trigger('click');
        expect(view.emitted('retryCatalogs')).toHaveLength(1);
        expect(document.activeElement).toBe(view.get('[name="firstName"]').element);
        await view.setProps({ catalogsError: '', catalogsLoading: true });
        await view.setProps({
            catalogsLoading: false,
            provinces,
            cantons,
            districts,
            branches: [{ id: 1, label: 'Sucursal' }],
        });
        expect(view.find('[role="alert"]').exists()).toBe(false);
        expect(view.get('[name="firstName"]').element.value).toBe('Ana');
        expect(view.get('[name="branchId"]').attributes('disabled')).toBeUndefined();
        expect(view.get('[name="provinceId"]').attributes('disabled')).toBeUndefined();
        await view.get('[name="provinceId"]').setValue('1');
        await view.get('[name="cantonId"]').setValue('11');
        expect(view.get('[name="districtId"]').text()).toContain('Distrito A1');
    });
    it('validates available selections and clears child errors after changing province', async () => {
        const view = await renderDialog({
            provinces,
            cantons,
            districts,
            branches: [{ id: 7, label: 'Sucursal de prueba' }],
        });
        for (const name of ['role', 'branchId', 'provinceId', 'cantonId', 'districtId']) {
            const field = view.get('[name="' + name + '"]');
            const validValues = {
                role: 'EMPLOYEE',
                branchId: '7',
                provinceId: '1',
                cantonId: '11',
                districtId: '111',
            };
            await field.setValue(validValues[name]);
            await field.trigger('focusout');
            expect(field.attributes('aria-invalid')).toBe('false');
        }
        const district = view.get('[name="districtId"]');
        await district.setValue('');
        expect(district.attributes('aria-invalid')).toBe('true');
        await view.get('[name="provinceId"]').setValue('2');
        expect(district.attributes('aria-invalid')).toBe('false');
        expect(district.attributes('disabled')).toBeDefined();
        expect(view.find('.field-error').exists()).toBe(false);
    });
});
