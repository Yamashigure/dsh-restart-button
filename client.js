window.__ModuleLoader__.load({
  id: '@local/dsh-restart-button',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useRef, useState } = React;

    const NS = 'dsh-restart-button';
    const ORDER = 46;
    const COMMAND = '/dsh-restart';

    const DICT = {
      zh: {
        title: '点一下，DSH 立刻重启',
        hint: '整台应用会退出，几秒后自己回来。',
        noSession: '先开一个会话，这个按钮才点得动。',
        failed: '没重启成，DSH 还在。',
        sent: '好，正在重启。',
      },
      en: {
        title: 'Click to restart DSH now',
        hint: 'The whole app quits and comes back in a few seconds.',
        noSession: 'Open a session first, then this button works.',
        failed: 'Restart did not happen. DSH is still here.',
        sent: 'Restarting now.',
      },
    };

    // 标题栏是系统绘制的 overlay（高 40px），系统按钮区约 138px 宽，这枚按钮落在
    // 它左边约 20px。从上往下看：一圈亮银色的金属座，中间一颗鼓起来的红顶。按下时
    // 红顶往下沉一点、缩一点，金属座不动，就是那个行程。
    const CSS = `
      .rsb-seat{position:fixed;top:0;right:158px;height:40px;display:flex;align-items:center;justify-content:flex-end;
        z-index:${ORDER};pointer-events:none;-webkit-app-region:no-drag;font-family:inherit;}
      .rsb-btn{pointer-events:auto;-webkit-app-region:no-drag;position:relative;width:38px;height:38px;padding:0;
        border:0;border-radius:50%;background:none;cursor:pointer;display:block;line-height:0;}
      .rsb-btn svg{display:block;width:38px;height:38px;
        filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));
        transition:filter .15s ease, transform .07s ease-out;}
      .rsb-btn:hover svg{filter:drop-shadow(0 2px 4px rgba(0,0,0,.55)) brightness(1.06);}
      .rsb-btn:active svg{filter:drop-shadow(0 1px 1px rgba(0,0,0,.55)) brightness(.97);}
      .rsb-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color, #fff);outline-offset:2px;border-radius:50%;}
      .rsb-dome{transform-origin:20px 20px;transition:transform .07s ease-out;}
      .rsb-btn:active .rsb-dome{transform:translateY(2px) scale(.93);}
      .rsb-btn[data-busy='1']{cursor:default;animation:rsb-pulse 1s ease-in-out infinite;}
      .rsb-note{position:absolute;top:44px;right:0;width:max-content;max-width:260px;padding:8px 10px;border-radius:8px;text-align:left;
        background:var(--dsw-alias-bg-overlay, #1b1f27);border:1px solid var(--dsw-alias-border-l2, #2a3142);
        color:var(--dsw-alias-label-primary, #e6e9f2);font-size:12px;line-height:1.5;white-space:normal;
        box-shadow:0 10px 30px rgba(0,0,0,.42);pointer-events:none;}
      @keyframes rsb-pulse{0%,100%{filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));}50%{filter:drop-shadow(0 2px 6px rgba(255,60,48,.55)) brightness(1.22);}}
      @media (prefers-reduced-motion: reduce){.rsb-btn[data-busy='1']{animation:none;}}
      html:not([data-windows-titlebar]) .rsb-seat{display:none;}
      html[data-fullscreen] .rsb-seat{top:var(--dsh-frame-overlay-top, 20px);right:16px;height:32px;}
    `;

    /** 自己画的：金属座 + 红顶，俯视。不用任何现成图片。 */
    function ButtonFace() {
      return h('svg', { viewBox: '0 0 40 40', width: 38, height: 38, 'aria-hidden': 'true', focusable: 'false' },
        h('defs', null,
          h('radialGradient', { id: 'rsb-metal', cx: '36%', cy: '24%', r: '80%' },
            h('stop', { offset: '0%', stopColor: '#f4f6fa' }),
            h('stop', { offset: '40%', stopColor: '#c6ccd6' }),
            h('stop', { offset: '62%', stopColor: '#8f96a1' }),
            h('stop', { offset: '74%', stopColor: '#e4e8ef' }),
            h('stop', { offset: '86%', stopColor: '#99a0ab' }),
            h('stop', { offset: '100%', stopColor: '#4f545e' }),
          ),
          h('radialGradient', { id: 'rsb-bezel', cx: '42%', cy: '34%', r: '72%' },
            h('stop', { offset: '0%', stopColor: '#3f444d' }),
            h('stop', { offset: '52%', stopColor: '#838a95' }),
            h('stop', { offset: '100%', stopColor: '#cfd5de' }),
          ),
          h('radialGradient', { id: 'rsb-dome', cx: '34%', cy: '25%', r: '84%' },
            h('stop', { offset: '0%', stopColor: '#f5856e' }),
            h('stop', { offset: '24%', stopColor: '#e02f1e' }),
            h('stop', { offset: '60%', stopColor: '#bd1410' }),
            h('stop', { offset: '86%', stopColor: '#8c0a06' }),
            h('stop', { offset: '100%', stopColor: '#5f0403' }),
          ),
        ),
        // 金属座：外圈亮银，往里凹一道很窄的暗槽
        h('circle', { cx: 20, cy: 20, r: 18.6, fill: 'url(#rsb-metal)', stroke: 'rgba(0,0,0,.42)', strokeWidth: 0.7 }),
        h('circle', { cx: 20, cy: 20, r: 16.2, fill: 'url(#rsb-bezel)' }),
        h('circle', { cx: 20, cy: 20, r: 15.7, fill: 'none', stroke: 'rgba(0,0,0,.34)', strokeWidth: 0.9 }),
        // 红顶
        h('g', { className: 'rsb-dome' },
          h('circle', { cx: 20, cy: 20, r: 15, fill: 'url(#rsb-dome)', stroke: 'rgba(55,3,2,.6)', strokeWidth: 0.8 }),
          h('ellipse', { cx: 20, cy: 31.2, rx: 11.4, ry: 3.5, fill: '#4d0302', opacity: 0.36 }),
          h('ellipse', { cx: 15, cy: 13.4, rx: 4.9, ry: 2.8, fill: '#ffffff', opacity: 0.72, transform: 'rotate(-24 15 13.4)' }),
          h('ellipse', { cx: 25.2, cy: 10.8, rx: 2.4, ry: 1.15, fill: '#ffffff', opacity: 0.4, transform: 'rotate(-14 25.2 10.8)' }),
        ),
      );
    }

    function Seat(props) {
      const { t, useSessions, execute } = props;
      const sessionId = useSessions((state) => state.current || state.ids[0]);
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const hideTimer = useRef(0);
      const resetTimer = useRef(0);

      useEffect(() => () => {
        clearTimeout(hideTimer.current);
        clearTimeout(resetTimer.current);
      }, []);

      const speak = useCallback((text) => {
        setNote(text);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setNote(''), 7000);
      }, []);

      const onClick = useCallback(async () => {
        if (busy) return;
        if (!sessionId) {
          speak(t('noSession'));
          return;
        }
        setBusy(true);
        setNote(t('hint'));
        // 兜底：助手要是没动作，按钮自己回来，不至于永远转着。
        resetTimer.current = setTimeout(() => setBusy(false), 12000);
        try {
          const settled = await execute(sessionId, COMMAND);
          if (!settled || settled.ok !== true) {
            const failure = settled && settled.error;
            throw new Error(failure ? failure.message || failure.code : t('failed'));
          }
          if (settled.value === undefined) throw new Error(t('failed'));
          const outcome = settled.value.result;
          if (outcome && outcome.kind === 'error') throw new Error(outcome.text || t('failed'));
          speak(outcome && outcome.text ? outcome.text : t('sent'));
          // 成功就保持「重启中」：窗口马上要消失，按钮不该再亮回来。
        } catch (cause) {
          clearTimeout(resetTimer.current);
          setBusy(false);
          speak(cause && cause.message ? cause.message : t('failed'));
        }
      }, [busy, sessionId, execute, t, speak]);

      return h('div', { className: 'rsb-seat' },
        h('style', null, CSS),
        h('button', {
          type: 'button',
          className: 'rsb-btn',
          title: t('title'),
          'aria-label': t('title'),
          'aria-busy': busy ? 'true' : 'false',
          'data-busy': busy ? '1' : '0',
          onClick,
        }, h(ButtonFace)),
        note ? h('div', { className: 'rsb-note' }, note) : null,
      );
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', DICT.zh);
          const offEn = ctx.locale.register(NS, 'en', DICT.en);
          return () => {
            try { offZh(); } catch { /* 忽略 */ }
            try { offEn(); } catch { /* 忽略 */ }
          };
        }, 'dsh-restart-button: locale');

        const t = ctx.locale.bind(NS);
        const execute = (sessionId, line) => ctx.remote.commands.execute(sessionId, line, []);

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-restart-button',
          order: ORDER,
        }, (props) => h(Seat, { ...props, t, execute })));
      },
    };
  },
});
