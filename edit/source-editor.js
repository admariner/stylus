/* global CodeMirror dirtyReporter initLint beautify showKeyMapHelp */
/* global showToggleStyleHelp goBackToManage updateLintReportIfEnabled */
/* global hotkeyRerouter setupAutocomplete */
/* global editors linterConfig updateLinter regExpTester mozParser */
/* global makeLink createAppliesToLineWidget messageBox */
'use strict';

function createSourceEditor(style) {
  // a flag for isTouched()
  let hadBeenSaved = false;
  let savedGeneration = 0;

  $('#name').disabled = true;
  $('#mozilla-format-container').remove();
  $('#sections').textContent = '';
  $('#sections').appendChild(
    $element({className: 'single-editor'})
  );

  const dirty = dirtyReporter();
  dirty.onChange(() => {
    document.body.classList.toggle('dirty', dirty.isDirty());
    $('#save-button').disabled = !dirty.isDirty();
    updateTitle();
  });

  // normalize style
  if (!style.id) {
    setupNewStyle(style);
  } else {
    // style might be an object reference to background page
    style = deepCopy(style);
  }

  const cm = CodeMirror($('.single-editor'));
  editors.push(cm);
  updateMeta().then(() => {
    initLint();
    initLinterSwitch();

    cm.setValue(style.sourceCode);
    cm.clearHistory();
    cm.markClean();
    savedGeneration = cm.changeGeneration();

    initHooks();
    initAppliesToLineWidget();

    // focus must be the last action, otherwise the style is duplicated on saving
    cm.focus();
  });

  function initAppliesToLineWidget() {
    const PREF_NAME = 'editor.appliesToLineWidget';
    const widget = createAppliesToLineWidget(cm);
    widget.toggle(prefs.get(PREF_NAME));
    prefs.subscribe([PREF_NAME], (key, value) => widget.toggle(value));
  }

  function initLinterSwitch() {
    const linterEl = $('#editor.linter');
    cm.on('optionChange', (cm, option) => {
      if (option !== 'mode') {
        return;
      }
      updateLinter();
      update();
    });
    linterEl.addEventListener('change', update);
    update();

    function update() {
      linterEl.value = linterConfig.getDefault();

      const cssLintOption = linterEl.querySelector('[value="csslint"]');
      if (cm.getOption('mode') !== 'css') {
        cssLintOption.disabled = true;
        cssLintOption.title = t('linterCSSLintIncompatible', cm.getOption('mode'));
      } else {
        cssLintOption.disabled = false;
        cssLintOption.title = '';
      }
    }
  }

  function setupNewStyle(style) {
    style.sections[0].code = ' '.repeat(prefs.get('editor.tabSize')) + '/* Insert code here... */';
    let section = mozParser.format(style);
    if (!section.includes('@-moz-document')) {
      style.sections[0].domains = ['example.com'];
      section = mozParser.format(style);
    }

    const DEFAULT_CODE = `
      /* ==UserStyle==
      @name           ${t('usercssReplaceTemplateName') + ' - ' + new Date().toLocaleString()}
      @namespace      github.com/openstyles/stylus
      @version        0.1.0
      @description    A new userstyle
      @author         Me
      ==/UserStyle== */
      
      ${section}
    `.replace(/^\s+/gm, '');
    dirty.clear('sourceGeneration');
    style.sourceCode = '';
    BG.chromeSync.getLZValue('usercssTemplate').then(code => {
      style.sourceCode = code || DEFAULT_CODE;
      cm.startOperation();
      cm.setValue(style.sourceCode);
      cm.clearHistory();
      cm.markClean();
      cm.endOperation();
      dirty.clear('sourceGeneration');
      savedGeneration = cm.changeGeneration();
    });
  }

  function initHooks() {
    $('#save-button').onclick = save;
    $('#beautify').onclick = beautify;
    $('#keyMap-help').onclick = showKeyMapHelp;
    $('#toggle-style-help').onclick = showToggleStyleHelp;
    $('#cancel-button').onclick = goBackToManage;

    $('#enabled').onchange = function () {
      const value = this.checked;
      dirty.modify('enabled', style.enabled, value);
      style.enabled = value;
    };

    cm.on('changes', () => {
      dirty.modify('sourceGeneration', savedGeneration, cm.changeGeneration());
      updateLintReportIfEnabled(cm);
    });

    cm.on('focus', () => hotkeyRerouter.setState(false));
    cm.on('blur', () => hotkeyRerouter.setState(true));

    //if (prefs.get('editor.autocompleteOnTyping')) {
    //  setupAutocomplete(cm);
    //}
  }

  function updateMeta() {
    $('#name').value = style.name;
    $('#enabled').checked = style.enabled;
    $('#url').href = style.url;
    const {usercssData: {preprocessor} = {}} = style;
    // beautify only works with regular CSS
    $('#beautify').disabled = cm.getOption('mode') !== 'css';
    updateTitle();
    return cm.setPreprocessor(preprocessor);
  }

  function updateTitle() {
    const newTitle = (dirty.isDirty() ? '* ' : '') +
      (style.id ? t('editStyleTitle', [style.name]) : t('addStyleTitle'));
    if (document.title !== newTitle) {
      document.title = newTitle;
    }
  }

  function replaceStyle(newStyle, codeIsUpdated) {
    const sameCode = newStyle.sourceCode === cm.getValue();
    hadBeenSaved = sameCode;
    if (sameCode) {
      savedGeneration = cm.changeGeneration();
      dirty.clear('sourceGeneration');
    }
    if (codeIsUpdated === false || sameCode) {
      // copy changed meta anyway
      style = deepCopy(newStyle);
      dirty.clear('enabled');
      updateMeta();
      return;
    }
    Promise.resolve(messageBox.confirm(t('styleUpdateDiscardChanges'))).then(ok => {
      if (!ok) {
        return;
      }
      if (!style.id && newStyle.id) {
        history.replaceState({}, '', `?id=${newStyle.id}`);
      }
      style = deepCopy(newStyle);
      updateMeta();
      if (!sameCode) {
        const cursor = cm.getCursor();
        cm.setValue(style.sourceCode);
        cm.setCursor(cursor);
        savedGeneration = cm.changeGeneration();
      }
      dirty.clear();
    });
  }

  function toggleStyle() {
    const value = !style.enabled;
    dirty.modify('enabled', style.enabled, value);
    style.enabled = value;
    updateMeta();
    // save when toggle enable state?
    save();
  }

  function save() {
    if (!dirty.isDirty()) {
      return;
    }
    return onBackgroundReady()
      .then(() => BG.usercssHelper.save({
        reason: 'editSave',
        id: style.id,
        enabled: style.enabled,
        sourceCode: cm.getValue(),
      }))
      .then(replaceStyle)
      .catch(err => {
        if (err.message === t('styleMissingMeta', 'name')) {
          messageBox.confirm(t('usercssReplaceTemplateConfirmation')).then(ok => ok &&
            BG.chromeSync.setLZValue('usercssTemplate', style.sourceCode)
              .then(() => BG.chromeSync.getLZValue('usercssTemplate'))
              .then(saved => {
                if (saved !== style.sourceCode) {
                  messageBox.alert(t('syncStorageErrorSaving'));
                }
              }));
          return;
        }
        const contents = [String(err)];
        if (Number.isInteger(err.index)) {
          const pos = cm.posFromIndex(err.index);
          contents[0] += ` (line ${pos.line + 1} col ${pos.ch + 1})`;
          contents.push($element({
            tag: 'pre',
            textContent: drawLinePointer(pos)
          }));
        }
        messageBox.alert(contents);
      });

    function drawLinePointer(pos) {
      const SIZE = 60;
      const line = cm.getLine(pos.line);
      const pointer = ' '.repeat(pos.ch) + '^';
      const start = Math.max(Math.min(pos.ch - SIZE / 2, line.length - SIZE), 0);
      const end = Math.min(Math.max(pos.ch + SIZE / 2, SIZE), line.length);
      const leftPad = start !== 0 ? '...' : '';
      const rightPad = end !== line.length ? '...' : '';
      return leftPad + line.slice(start, end) + rightPad + '\n' +
        ' '.repeat(leftPad.length) + pointer.slice(start, end);
    }
  }

  function isTouched() {
    // indicate that the editor had been touched by the user
    return dirty.isDirty() || hadBeenSaved;
  }

  return {
    replaceStyle,
    save,
    toggleStyle,
    isDirty: dirty.isDirty,
    getStyle: () => style,
    isTouched
  };
}
