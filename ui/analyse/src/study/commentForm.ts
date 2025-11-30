import { prop } from 'lib';
import { onInsert } from 'lib/view';
import { throttle } from 'lib/async';
import { h, type VNode } from 'snabbdom';
import type AnalyseCtrl from '../ctrl';
import { currentComments, isAuthorObj } from './studyComments';
import { storage } from 'lib/storage';

interface Current {
  chapterId: string;
  path: Tree.Path;
  node: Tree.Node;
  commentId: string;
}

export class CommentForm {
  // Changed from single prop to Map for multiple simultaneous edits
  currents = new Map<string, Current>();
  opening = prop<string | null>(null); // Track which position is opening
  
  constructor(readonly root: AnalyseCtrl) {}

  private makeKey(chapterId: string, path: Tree.Path, commentId: string): string {
    return `${chapterId}:${path}:${commentId}`;
  }


  submit = (chapterId: string, path: Tree.Path, key: string, text: string) => {
     const current = this.currents.get(key);
    if (current) {
      this.doSubmit(current.chapterId, current.path, current.commentId, text);
    }
  };

  doSubmit = throttle(500, (chapterId: string, path: Tree.Path, text: string) => {
    this.root.study!.makeChange('setComment', { ch: chapterId, path, text });
  });

  start = (chapterId: string, path: Tree.Path, node: Tree.Node, commentId: string): void => {
    const key = this.makeKey(chapterId, path, commentId);
    this.opening(key);
    this.currents.set(key, { chapterId, path, node, commentId});
    this.root.userJump(path);
  };

  onSetPath = (chapterId: string, path: Tree.Path, node: Tree.Node): void => {
    const key = this.makeKey(chapterId, path, '');
    const cur = this.currents.get(key);
    if (cur && cur.node !== node) {
      cur.node = node;
    }
  };

  delete = (chapterId: string, path: Tree.Path, id: string) => {
    this.root.study!.makeChange('deleteComment', { ch: chapterId, path, id });
  };

  remove = (chapterId: string, path: Tree.Path) => {
    const key = this.makeKey(chapterId, path, '');
    this.currents.delete(key);
  };

  clear = () => {
    this.currents.clear();
  };

  has = (chapterId: string, path: Tree.Path): boolean => {
    return this.currents.has(this.makeKey(chapterId, path, ''));
  };
}

export const viewDisabled = (root: AnalyseCtrl, why: string): VNode =>
  h('div.study__comments', [currentComments(root, true), h('div.study__message', why)]);

function renderTextarea(
  root: AnalyseCtrl,
  ctrl: CommentForm,
  current: Current,
  key: string,
): VNode {
  const study = root.study!;
  const setupTextarea = (vnode: VNode, old?: VNode) => {
    const el = vnode.elm as HTMLTextAreaElement;
    console.log('setupTextarea', key);
    if (old?.data!.key !== key) {
      const mine = (current.node.comments || []).find(function (c) {
        return isAuthorObj(c.by) && c.by.id && c.by.id === ctrl.root.opts.userId;
      });
      el.value = mine ? mine.text : '';
    }
    vnode.data!.key = key;

    if (ctrl.opening() === key) {
      requestAnimationFrame(() => el.focus());
      ctrl.opening(null);
    }
  };

  return h(
    'div.study__comments',
    { hook: onInsert(() => root.enableWiki(root.data.game.variant.key === 'standard')) },
    [
      currentComments(root, !study.members.canContribute()),
      h('form.form3', [
        h('textarea#comment-text.form-control', {
          hook: {
            insert(vnode) {
              setupTextarea(vnode);
              const el = vnode.elm as HTMLInputElement;
              el.oninput = () => setTimeout(() => ctrl.submit(current.chapterId, current.path, key, el.value), 50);
              const heightStore = storage.make('study.comment.height');
              el.onmouseup = () => heightStore.set('' + el.offsetHeight);
              el.style.height = parseInt(heightStore.get() || '80') + 'px';

              $(el).on('keydown', e => {
                if (e.code === 'Escape') el.blur();
              });
            },
            postpatch: (old, vnode) => setupTextarea(vnode, old),
          },
        }),
      ]),
    ],
  );
}

export function view(root: AnalyseCtrl): VNode {
  const study = root.study!;
  const ctrl = study.commentForm;

  if (ctrl.currents.size === 0) {
    return viewDisabled(root, 'Select a move to comment');
  }

  return h(
    'div.study__comments',
    {
      hook: onInsert(() => root.enableWiki(root.data.game.variant.key === 'standard')),
    },
    [
      h(
        'div.study__comment-forms',
        Array.from(ctrl.currents.entries()).map(([key, current]) =>
          renderTextarea(root, ctrl, current, key),
        ),
      ),
      h('div.analyse__wiki.study__wiki.force-ltr'),
    ],
  );
}
