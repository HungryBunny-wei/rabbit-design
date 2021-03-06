/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {EmbeddedViewRef, ElementRef, NgZone, ViewContainerRef, TemplateRef} from '@angular/core';
import {ViewportRuler} from '@angular/cdk/scrolling';
import {Directionality} from '@angular/cdk/bidi';
import {normalizePassiveListenerOptions} from '@angular/cdk/platform';
import {coerceBooleanProperty} from '@angular/cdk/coercion';
import {Subscription, Subject} from 'rxjs';
import {DragDropRegistry} from '../cdk-drag-drop';
import {extendStyles, toggleNativeDragInteractions} from '../cdk-drag-drop/drag-styling';
import {RaDesignDragDirective} from './ra-design-drag.directive';
import {RaDesignDropDirective} from './ra-design-drop.directive';
import {getTransformTransitionDurationInMs} from '../cdk-drag-drop/transition-duration';

/** Object that can be used to configure the behavior of DragRef. */
export interface DragRefConfig {
  /**
   * Minimum amount of pixels that the user should
   * drag, before the CDK initiates a drag sequence.
   */
  dragStartThreshold: number;

  /**
   * Amount the pixels the user should drag before the CDK
   * considers them to have changed the drag direction.
   */
  pointerDirectionChangeThreshold: number;
}

/** Options that can be used to bind a passive event listener. */
const passiveEventListenerOptions = normalizePassiveListenerOptions({passive: true});

/** Options that can be used to bind an active event listener. */
const activeEventListenerOptions = normalizePassiveListenerOptions({passive: false});

/**
 * Time in milliseconds for which to ignore mouse events, after
 * receiving a touch event. Used to avoid doing double work for
 * touch devices where the browser fires fake mouse events, in
 * addition to touch events.
 */
const MOUSE_EVENT_IGNORE_TIME = 800;

/**
 * Template that can be used to create a drag helper element (e.g. a preview or a placeholder).
 */
interface DragHelperTemplate<T = any> {
  templateRef: TemplateRef<T>;
  data: T;
}

interface DragHandle {
  element: ElementRef<HTMLElement>;
  disabled: boolean;
}

/**
 * Reference to a draggable item. Used to manipulate or dispose of the item.
 * @docs-private
 */
export class RaDesignDragRef<T = any> {
  /** Element displayed next to the user's pointer while the element is dragged. */
  private _preview: HTMLElement;

  /** Reference to the view of the preview element. */
  private _previewRef: EmbeddedViewRef<any> | null;

  /** Reference to the view of the placeholder element. */
  private _placeholderRef: EmbeddedViewRef<any> | null;

  /** Element that is rendered instead of the draggable item while it is being sorted. */
  private _placeholder: HTMLElement;

  /** Coordinates within the element at which the user picked up the element. */
  private _pickupPositionInElement: Point;

  /** Coordinates on the page at which the user picked up the element. */
  private _pickupPositionOnPage: Point;

  /**
   * Reference to the element that comes after the draggable in the DOM, at the time
   * it was picked up. Used for restoring its initial position when it's dropped.
   */
  private _nextSibling: Node | null;

  /**
   * CSS `transform` applied to the element when it isn't being dragged. We need a
   * passive transform in order for the dragged element to retain its new position
   * after the user has stopped dragging and because we need to know the relative
   * position in case they start dragging again. This corresponds to `element.style.transform`.
   */
  private _passiveTransform: Point = {x: 0, y: 0};

  /** CSS `transform` that is applied to the element while it's being dragged. */
  private _activeTransform: Point = {x: 0, y: 0};

  /** Inline `transform` value that the element had before the first dragging sequence. */
  private _initialTransform?: string;

  /**
   * Whether the dragging sequence has been started. Doesn't
   * necessarily mean that the element has been moved.
   */
  private _hasStartedDragging: boolean;

  /** Whether the element has moved since the user started dragging it. */
  private _hasMoved: boolean;

  /** Drop container in which the DragRef resided when dragging began. */
  private _initialContainer: RaDesignDropDirective<T>;

  /** Cached scroll position on the page when the element was picked up. */
  private _scrollPosition: { top: number, left: number };

  /** Keeps track of the direction in which the user is dragging along each axis. */
  private _pointerDirectionDelta: { x: -1 | 0 | 1, y: -1 | 0 | 1 };

  /** Pointer position at which the last change in the delta occurred. */
  private _pointerPositionAtLastDirectionChange: Point;

  /**
   * Root DOM node of the drag instance. This is the element that will
   * be moved around as the user is dragging.
   */
  private _rootElement: HTMLElement;

  /**
   * Inline style value of `-webkit-tap-highlight-color` at the time the
   * dragging was started. Used to restore the value once we're done dragging.
   */
  private _rootElementTapHighlight: string | null;

  /** Subscription to pointer movement events. */
  private _pointerMoveSubscription = Subscription.EMPTY;

  /** Subscription to the event that is dispatched when the user lifts their pointer. */
  private _pointerUpSubscription = Subscription.EMPTY;

  /**
   * Time at which the last touch event occurred. Used to avoid firing the same
   * events multiple times on touch devices where the browser will fire a fake
   * mouse event for each touch event, after a certain time.
   */
  private _lastTouchEventTime: number;

  /** Cached reference to the boundary element. */
  private _boundaryElement: HTMLElement | null = null;

  /** Whether the native dragging interactions have been enabled on the root element. */
  private _nativeInteractionsEnabled = true;

  /** Cached dimensions of the preview element. */
  private _previewRect?: ClientRect;

  /** Cached dimensions of the boundary element. */
  private _boundaryRect?: ClientRect;

  /** Element that will be used as a template to create the draggable item's preview. */
  private _previewTemplate: DragHelperTemplate | null;

  /** Template for placeholder element rendered to show where a draggable would be dropped. */
  private _placeholderTemplate: DragHelperTemplate | null;

  /** Elements that can be used to drag the draggable item. */
  private _handles: DragHandle[] = [];

  /** Axis along which dragging is locked. */
  lockAxis: 'x' | 'y';

  /** Whether starting to drag this element is disabled. */
  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(value: boolean) {
    const newValue = coerceBooleanProperty(value);

    if (newValue !== this._disabled) {
      this._disabled = newValue;
      this._toggleNativeDragInteractions();
    }
  }

  private _disabled = false;

  /** Emits as the drag sequence is being prepared. */
  beforeStarted = new Subject<void>();

  /** Arbitrary data that can be attached to the drag item. */
  data: RaDesignDragDirective;

  dropContainer: RaDesignDropDirective<T>;

  constructor(
    private element: ElementRef<HTMLElement>,
    private _document: Document,
    private _ngZone: NgZone,
    private _viewContainerRef: ViewContainerRef,
    private _viewportRuler: ViewportRuler,
    private _dragDropRegistry: DragDropRegistry<RaDesignDragRef, any>,
    private _config: DragRefConfig,
    private _dir?: Directionality
  ) {
    this.withRootElement(element);
    _dragDropRegistry.registerDragItem(this);
  }

  /**
   * Returns the element that is being used as a placeholder
   * while the current element is being dragged.
   */
  getPlaceholderElement(): HTMLElement {
    return this._placeholder;
  }

  /** Returns the root draggable element. */
  getRootElement(): HTMLElement {
    return this._rootElement;
  }

  /** Registers the handles that can be used to drag the element. */
  withHandles(handles: DragHandle[]): this {
    // TODO(crisbeto): have this accept HTMLElement[] | ElementRef<HTMLElement>[]
    this._handles = handles;
    handles.forEach(handle => toggleNativeDragInteractions(handle.element.nativeElement, false));
    this._toggleNativeDragInteractions();
    return this;
  }

  /** Registers the template that should be used for the drag preview. */
  withPreviewTemplate(template: DragHelperTemplate | null): this {
    // TODO(crisbeto): have this accept a TemplateRef
    this._previewTemplate = template;
    return this;
  }

  /** Registers the template that should be used for the drag placeholder. */
  withPlaceholderTemplate(template: DragHelperTemplate | null): this {
    // TODO(crisbeto): have this accept a TemplateRef
    this._placeholderTemplate = template;
    return this;
  }


  /**
   * Sets an alternate drag root element. The root element is the element that will be moved as
   * the user is dragging. Passing an alternate root element is useful when trying to enable
   * dragging on an element that you might not have access to.
   */
  withRootElement(rootElement: ElementRef<HTMLElement> | HTMLElement): this {
    const element = rootElement instanceof ElementRef ? rootElement.nativeElement : rootElement;

    if (element !== this._rootElement) {
      if (this._rootElement) {
        this._removeRootElementListeners(this._rootElement);
      }

      element.addEventListener('mousedown', this._pointerDown, activeEventListenerOptions);
      element.addEventListener('touchstart', this._pointerDown, passiveEventListenerOptions);
      this._rootElement = element;
    }

    return this;
  }

  /**
   * Element to which the draggable's position will be constrained.
   */
  withBoundaryElement(boundaryElement: ElementRef<HTMLElement> | HTMLElement | null): this {
    this._boundaryElement = boundaryElement instanceof ElementRef ?
      boundaryElement.nativeElement : boundaryElement;
    return this;
  }

  /** Removes the dragging functionality from the DOM element. */
  dispose() {
    this._removeRootElementListeners(this._rootElement);

    // Do this check before removing from the registry since it'll
    // stop being considered as dragged once it is removed.
    if (this.isDragging()) {
      // Since we move out the element to the end of the body while it's being
      // dragged, we have to make sure that it's removed if it gets destroyed.
      removeElement(this._rootElement);
    }

    this._destroyPreview();
    this._destroyPlaceholder();
    this._dragDropRegistry.removeDragItem(this);
    this._removeSubscriptions();
    this.beforeStarted.complete();
    this._handles = [];
    this._boundaryElement = this._rootElement = this._placeholderTemplate =
      this._previewTemplate = this._nextSibling = null!;
  }

  /** Checks whether the element is currently being dragged. */
  isDragging(): boolean {
    return this._hasStartedDragging && this._dragDropRegistry.isDragging(this);
  }

  /** Resets a standalone drag item to its initial position. */
  reset(): void {
    this._rootElement.style.transform = '';
    this._activeTransform = {x: 0, y: 0};
    this._passiveTransform = {x: 0, y: 0};
  }

  /** Unsubscribes from the global subscriptions. */
  private _removeSubscriptions() {
    this._pointerMoveSubscription.unsubscribe();
    this._pointerUpSubscription.unsubscribe();
  }

  /** Destroys the preview element and its ViewRef. */
  private _destroyPreview() {
    if (this._preview) {
      removeElement(this._preview);
    }

    if (this._previewRef) {
      this._previewRef.destroy();
    }

    this._preview = this._previewRef = null!;
  }

  /** Destroys the placeholder element and its ViewRef. */
  private _destroyPlaceholder() {
    if (this._placeholder) {
      removeElement(this._placeholder);
    }

    if (this._placeholderRef) {
      this._placeholderRef.destroy();
    }

    this._placeholder = this._placeholderRef = null!;
  }


  /** Handler for the `mousedown`/`touchstart` events. */
  private _pointerDown = (event: MouseEvent | TouchEvent) => {
    this.beforeStarted.next();

    // Delegate the event based on whether it started from a handle or the element itself.
    if (this._handles.length) {
      const targetHandle = this._handles.find(handle => {
        const element = handle.element.nativeElement;
        const target = event.target;
        return !!target && (target === element || element.contains(target as HTMLElement));
      });

      if (targetHandle && !targetHandle.disabled && !this.disabled) {
        this._initializeDragSequence(targetHandle.element.nativeElement, event);
      }
    } else if (!this.disabled) {
      this._initializeDragSequence(this._rootElement, event);
    }
  };

  /** Handler that is invoked when the user moves their pointer after they've initiated a drag. */
  private _pointerMove = (event: MouseEvent | TouchEvent) => {
    if (!this._hasStartedDragging) {
      const pointerPosition = this._getPointerPositionOnPage(event);
      const distanceX = Math.abs(pointerPosition.x - this._pickupPositionOnPage.x);
      const distanceY = Math.abs(pointerPosition.y - this._pickupPositionOnPage.y);

      // Only start dragging after the user has moved more than the minimum distance in either
      // direction. Note that this is preferrable over doing something like `skip(minimumDistance)`
      // in the `pointerMove` subscription, because we're not guaranteed to have one move event
      // per pixel of movement (e.g. if the user moves their pointer quickly).
      if (distanceX + distanceY >= this._config.dragStartThreshold) {
        this._hasStartedDragging = true;
        this._ngZone.run(() => this._startDragSequence(event));
      }

      return;
    }

    // We only need the preview dimensions if we have a boundary element.
    if (this._boundaryElement) {
      // Cache the preview element rect if we haven't cached it already or if
      // we cached it too early before the element dimensions were computed.
      if (!this._previewRect || (!this._previewRect.width && !this._previewRect.height)) {
        this._previewRect = (this._preview || this._rootElement).getBoundingClientRect();
      }
    }

    const constrainedPointerPosition = this._getConstrainedPointerPosition(event);
    this._hasMoved = true;
    event.preventDefault();
    this._updatePointerDirectionDelta(constrainedPointerPosition);
    // 查找drop元素
    const ele: {
      type: 'drop',
      drop: RaDesignDropDirective<T>,
    } = this.findElementUp(event.target);
    if (ele) {
      if (ele.type === 'drop') {
        if (this.dropContainer !== ele.drop) {
          this._ngZone.run(() => {
            if (this.dropContainer) {
              this.dropContainer.exit(this.data);
            }
            this.dropContainer = ele.drop;
            ele.drop.enter(this.data, constrainedPointerPosition.x, constrainedPointerPosition.y);
          });
        }
        ele.drop._sortItem(this.data, constrainedPointerPosition.x, constrainedPointerPosition.y, this._pointerDirectionDelta);
        this._preview.style.transform =
          getTransform(constrainedPointerPosition.x - this._pickupPositionInElement.x, constrainedPointerPosition.y - this._pickupPositionInElement.y);
      }
    } else {
      this._ngZone.run(() => {
        if (this.dropContainer) {
          this.dropContainer.exit(this.data);
        }
      });
      this.dropContainer = null;
      const activeTransform = this._activeTransform;
      activeTransform.x =
        constrainedPointerPosition.x - this._pickupPositionOnPage.x + this._passiveTransform.x;
      activeTransform.y =
        constrainedPointerPosition.y - this._pickupPositionOnPage.y + this._passiveTransform.y;
      const transform = getTransform(activeTransform.x, activeTransform.y);
      this._preview.style.transform =
        getTransform(constrainedPointerPosition.x - this._pickupPositionInElement.x, constrainedPointerPosition.y - this._pickupPositionInElement.y);
      // Preserve the previous `transform` value, if there was one.
      // this._rootElement.style.transform = this._initialTransform ?
      //   this._initialTransform + ' ' + transform : transform;

      // Apply transform as attribute if dragging and svg element to work for IE
      if (typeof SVGElement !== 'undefined' && this._rootElement instanceof SVGElement) {
        const appliedTransform = `translate(${activeTransform.x} ${activeTransform.y})`;
        this._rootElement.setAttribute('transform', appliedTransform);
      }
    }
  };

  /** Handler that is invoked when the user lifts their pointer up, after initiating a drag. */
  private _pointerUp = (event: MouseEvent | TouchEvent) => {
    // Note that here we use `isDragging` from the service, rather than from `this`.
    // The difference is that the one from the service reflects whether a dragging sequence
    // has been initiated, whereas the one on `this` includes whether the user has passed
    // the minimum dragging threshold.
    if (!this._dragDropRegistry.isDragging(this)) {
      return;
    }

    this._removeSubscriptions();
    this._dragDropRegistry.stopDragging(this);

    if (this._handles) {
      this._rootElement.style.webkitTapHighlightColor = this._rootElementTapHighlight;
    }

    if (!this._hasStartedDragging) {
      return;
    }

    // if (!this.dropContainer) {
    //   // Convert the active transform into a passive one. This means that next time
    //   // the user starts dragging the item, its position will be calculated relatively
    //   // to the new passive transform.
    //   this._passiveTransform.x = this._activeTransform.x;
    //   this._passiveTransform.y = this._activeTransform.y;
    //   this._dragDropRegistry.stopDragging(this);
    //   return;
    // }

    this._animatePreviewToPlaceholder().then(() => {
      this._cleanupDragArtifacts(event);
      this._dragDropRegistry.stopDragging(this);
    });
  };

  /** Starts the dragging sequence. */
  private _startDragSequence(event: MouseEvent | TouchEvent) {

    if (isTouchEvent(event)) {
      this._lastTouchEventTime = Date.now();
    }

    const element = this._rootElement;

    // Grab the `nextSibling` before the preview and placeholder
    // have been created so we don't get the preview by accident.
    this._nextSibling = element.nextSibling;

    const preview = this._preview = this._createPreviewElement();
    const placeholder = this._placeholder = this._createPlaceholderElement();

    // We move the element out at the end of the body and we make it hidden, because keeping it in
    // place will throw off the consumer's `:last-child` selectors. We can't remove the element
    // from the DOM completely, because iOS will stop firing all subsequent events in the chain.
    element.style.display = 'none';
    this._document.body.appendChild(element.parentNode!.replaceChild(placeholder, element));
    this._document.body.appendChild(preview);
    if (this.dropContainer) {
      this.dropContainer.start();
    }
  }

  /**
   * Sets up the different variables and subscriptions
   * that will be necessary for the dragging sequence.
   * @param referenceElement Element that started the drag sequence.
   * @param event Browser event object that started the sequence.
   */
  private _initializeDragSequence(referenceElement: HTMLElement, event: MouseEvent | TouchEvent) {
    // Always stop propagation for the event that initializes
    // the dragging sequence, in order to prevent it from potentially
    // starting another sequence for a draggable parent somewhere up the DOM tree.
    event.stopPropagation();

    const isDragging = this.isDragging();
    const isTouchSequence = isTouchEvent(event);
    const isAuxiliaryMouseButton = !isTouchSequence && (event as MouseEvent).button !== 0;
    const rootElement = this._rootElement;
    const isSyntheticEvent = !isTouchSequence && this._lastTouchEventTime &&
      this._lastTouchEventTime + MOUSE_EVENT_IGNORE_TIME > Date.now();

    // If the event started from an element with the native HTML drag&drop, it'll interfere
    // with our own dragging (e.g. `img` tags do it by default). Prevent the default action
    // to stop it from happening. Note that preventing on `dragstart` also seems to work, but
    // it's flaky and it fails if the user drags it away quickly. Also note that we only want
    // to do this for `mousedown` since doing the same for `touchstart` will stop any `click`
    // events from firing on touch devices.
    if (event.target && (event.target as HTMLElement).draggable && event.type === 'mousedown') {
      event.preventDefault();
    }

    // Abort if the user is already dragging or is using a mouse button other than the primary one.
    if (isDragging || isAuxiliaryMouseButton || isSyntheticEvent) {
      return;
    }

    // Cache the previous transform amount only after the first drag sequence, because
    // we don't want our own transforms to stack on top of each other.
    if (this._initialTransform == null) {
      this._initialTransform = this._rootElement.style.transform || '';
    }

    // If we've got handles, we need to disable the tap highlight on the entire root element,
    // otherwise iOS will still add it, even though all the drag interactions on the handle
    // are disabled.
    if (this._handles.length) {
      this._rootElementTapHighlight = rootElement.style.webkitTapHighlightColor;
      rootElement.style.webkitTapHighlightColor = 'transparent';
    }

    this._toggleNativeDragInteractions();
    this._hasStartedDragging = this._hasMoved = false;
    this._initialContainer = (this.element.nativeElement.parentElement as any).designDrop!;
    this._pointerMoveSubscription = this._dragDropRegistry.pointerMove.subscribe(this._pointerMove);
    this._pointerUpSubscription = this._dragDropRegistry.pointerUp.subscribe(this._pointerUp);
    this._scrollPosition = this._viewportRuler.getViewportScrollPosition();

    if (this._boundaryElement) {
      this._boundaryRect = this._boundaryElement.getBoundingClientRect();
    }

    // If we have a custom preview template, the element won't be visible anyway so we avoid the
    // extra `getBoundingClientRect` calls and just move the preview next to the cursor.
    this._pickupPositionInElement = this._previewTemplate ? {x: 0, y: 0} :
      this._getPointerPositionInElement(referenceElement, event);
    const pointerPosition = this._pickupPositionOnPage = this._getPointerPositionOnPage(event);
    this._pointerDirectionDelta = {x: 0, y: 0};
    this._pointerPositionAtLastDirectionChange = {x: pointerPosition.x, y: pointerPosition.y};
    this._dragDropRegistry.startDragging(this, event);
  }

  /** Cleans up the DOM artifacts that were added to facilitate the element being dragged. */
  private _cleanupDragArtifacts(event: MouseEvent | TouchEvent) {
    // Restore the element's visibility and insert it at its old position in the DOM.
    // It's important that we maintain the position, because moving the element around in the DOM
    // can throw off `NgFor` which does smart diffing and re-creates elements only when necessary,
    // while moving the existing elements in all other cases.
    this._rootElement.style.display = '';

    if (this._nextSibling) {
      this._nextSibling.parentNode!.insertBefore(this._rootElement, this._nextSibling);
    } else {
      this._initialContainer.element.nativeElement.appendChild(this._rootElement);
    }

    this._destroyPreview();
    this._destroyPlaceholder();
    this._boundaryRect = this._previewRect = undefined;
    if (!this.dropContainer) {
      return;
    }
    // Re-enter the NgZone since we bound `document` events on the outside.
    this._ngZone.run(() => {
      const container = this.dropContainer!;
      const currentIndex = container.getItemIndex(this.data);
      const {x, y} = this._getPointerPositionOnPage(event);
      const isPointerOverContainer = container._isOverContainer(x, y);

      container.drop(this.data, currentIndex, this._initialContainer, isPointerOverContainer);
      this.dropContainer = this._initialContainer;
    });
  }

  /**
   * Creates the element that will be rendered next to the user's pointer
   * and will be used as a preview of the element that is being dragged.
   */
  private _createPreviewElement(): HTMLElement {
    let preview: HTMLElement;

    if (this._previewTemplate) {
      const viewRef = this._viewContainerRef.createEmbeddedView(this._previewTemplate.templateRef,
        this._previewTemplate.data);

      preview = viewRef.rootNodes[0];
      this._previewRef = viewRef;
      preview.style.transform =
        getTransform(this._pickupPositionOnPage.x, this._pickupPositionOnPage.y);
    } else {
      const element = this._rootElement;
      const elementRect = element.getBoundingClientRect();

      preview = deepCloneNode(element);
      this.data.Renderer2.setProperty(preview, 'designDragType', this.data.designDragType);
      preview.style.width = `${elementRect.width}px`;
      preview.style.height = `${elementRect.height}px`;
      preview.style.transform = getTransform(elementRect.left, elementRect.top);
    }

    extendStyles(preview.style, {
      // It's important that we disable the pointer events on the preview, because
      // it can throw off the `document.elementFromPoint` calls in the `CdkDropList`.
      pointerEvents: 'none',
      position: 'fixed',
      top: '0',
      left: '0',
      zIndex: '1000'
    });

    toggleNativeDragInteractions(preview, false);

    preview.classList.add('cdk-drag-preview');
    preview.setAttribute('dir', this._dir ? this._dir.value : 'ltr');

    return preview;
  }

  /**
   * Animates the preview element from its current position to the location of the drop placeholder.
   * @returns Promise that resolves when the animation completes.
   */
  private _animatePreviewToPlaceholder(): Promise<void> {
    // If the user hasn't moved yet, the transitionend event won't fire.
    if (!this._hasMoved) {
      return Promise.resolve();
    }

    const placeholderRect = this._placeholder.getBoundingClientRect();

    // Apply the class that adds a transition to the preview.
    this._preview.classList.add('cdk-drag-animating');

    // Move the preview to the placeholder position.
    this._preview.style.transform = getTransform(placeholderRect.left, placeholderRect.top);

    // If the element doesn't have a `transition`, the `transitionend` event won't fire. Since
    // we need to trigger a style recalculation in order for the `cdk-drag-animating` class to
    // apply its style, we take advantage of the available info to figure out whether we need to
    // bind the event in the first place.
    const duration = getTransformTransitionDurationInMs(this._preview);

    if (duration === 0) {
      return Promise.resolve();
    }

    return this._ngZone.runOutsideAngular(() => {
      return new Promise(resolve => {
        const handler = ((event: TransitionEvent) => {
          if (!event || (event.target === this._preview && event.propertyName === 'transform')) {
            this._preview.removeEventListener('transitionend', handler);
            resolve();
            clearTimeout(timeout);
          }
        }) as EventListenerOrEventListenerObject;

        // If a transition is short enough, the browser might not fire the `transitionend` event.
        // Since we know how long it's supposed to take, add a timeout with a 50% buffer that'll
        // fire if the transition hasn't completed when it was supposed to.
        const timeout = setTimeout(handler as Function, duration * 1.5);
        this._preview.addEventListener('transitionend', handler);
      });
    });
  }

  /** Creates an element that will be shown instead of the current element while dragging. */
  private _createPlaceholderElement(): HTMLElement {
    let placeholder: HTMLElement;

    if (this._placeholderTemplate) {
      this._placeholderRef = this._viewContainerRef.createEmbeddedView(
        this._placeholderTemplate.templateRef,
        this._placeholderTemplate.data
      );
      placeholder = this._placeholderRef.rootNodes[0];
    } else {
      placeholder = deepCloneNode(this._rootElement);
    }

    placeholder.classList.add('cdk-drag-placeholder');
    return placeholder;
  }

  /**
   * Figures out the coordinates at which an element was picked up.
   * @param referenceElement Element that initiated the dragging.
   * @param event Event that initiated the dragging.
   */
  private _getPointerPositionInElement(referenceElement: HTMLElement,
                                       event: MouseEvent | TouchEvent): Point {
    const elementRect = this._rootElement.getBoundingClientRect();
    const handleElement = referenceElement === this._rootElement ? null : referenceElement;
    const referenceRect = handleElement ? handleElement.getBoundingClientRect() : elementRect;
    const point = isTouchEvent(event) ? event.targetTouches[0] : event;
    const x = point.pageX - referenceRect.left - this._scrollPosition.left;
    const y = point.pageY - referenceRect.top - this._scrollPosition.top;

    return {
      x: referenceRect.left - elementRect.left + x,
      y: referenceRect.top - elementRect.top + y
    };
  }

  /** Determines the point of the page that was touched by the user. */
  private _getPointerPositionOnPage(event: MouseEvent | TouchEvent): Point {
    // `touches` will be empty for start/end events so we have to fall back to `changedTouches`.
    const point = isTouchEvent(event) ? (event.touches[0] || event.changedTouches[0]) : event;

    return {
      x: point.pageX - this._scrollPosition.left,
      y: point.pageY - this._scrollPosition.top
    };
  }


  /** Gets the pointer position on the page, accounting for any position constraints. */
  private _getConstrainedPointerPosition(event: MouseEvent | TouchEvent): Point {
    const point = this._getPointerPositionOnPage(event);
    const dropContainerLock = this.dropContainer ? this.dropContainer.lockAxis : null;

    if (this.lockAxis === 'x' || dropContainerLock === 'x') {
      point.y = this._pickupPositionOnPage.y;
    } else if (this.lockAxis === 'y' || dropContainerLock === 'y') {
      point.x = this._pickupPositionOnPage.x;
    }

    if (this._boundaryRect) {
      const {x: pickupX, y: pickupY} = this._pickupPositionInElement;
      const boundaryRect = this._boundaryRect;
      const previewRect = this._previewRect!;
      const minY = boundaryRect.top + pickupY;
      const maxY = boundaryRect.bottom - (previewRect.height - pickupY);
      const minX = boundaryRect.left + pickupX;
      const maxX = boundaryRect.right - (previewRect.width - pickupX);

      point.x = clamp(point.x, minX, maxX);
      point.y = clamp(point.y, minY, maxY);
    }

    return point;
  }


  /** Updates the current drag delta, based on the user's current pointer position on the page. */
  private _updatePointerDirectionDelta(pointerPositionOnPage: Point) {
    const {x, y} = pointerPositionOnPage;
    const delta = this._pointerDirectionDelta;
    const positionSinceLastChange = this._pointerPositionAtLastDirectionChange;

    // Amount of pixels the user has dragged since the last time the direction changed.
    const changeX = Math.abs(x - positionSinceLastChange.x);
    const changeY = Math.abs(y - positionSinceLastChange.y);

    // Because we handle pointer events on a per-pixel basis, we don't want the delta
    // to change for every pixel, otherwise anything that depends on it can look erratic.
    // To make the delta more consistent, we track how much the user has moved since the last
    // delta change and we only update it after it has reached a certain threshold.
    if (changeX > this._config.pointerDirectionChangeThreshold) {
      delta.x = x > positionSinceLastChange.x ? 1 : -1;
      positionSinceLastChange.x = x;
    }

    if (changeY > this._config.pointerDirectionChangeThreshold) {
      delta.y = y > positionSinceLastChange.y ? 1 : -1;
      positionSinceLastChange.y = y;
    }

    return delta;
  }

  /** Toggles the native drag interactions, based on how many handles are registered. */
  private _toggleNativeDragInteractions() {
    if (!this._rootElement || !this._handles) {
      return;
    }

    const shouldEnable = this.disabled || this._handles.length > 0;

    if (shouldEnable !== this._nativeInteractionsEnabled) {
      this._nativeInteractionsEnabled = shouldEnable;
      toggleNativeDragInteractions(this._rootElement, shouldEnable);
    }
  }

  /** Removes the manually-added event listeners from the root element. */
  private _removeRootElementListeners(element: HTMLElement) {
    element.removeEventListener('mousedown', this._pointerDown, activeEventListenerOptions);
    element.removeEventListener('touchstart', this._pointerDown, passiveEventListenerOptions);
  }

  /** Find element up */
  private findElementUp(eventTarget: any): {
    type: 'drop',
    drop: RaDesignDropDirective<T>
  } {
    let currentElement: HTMLElement = eventTarget;
    let drop: RaDesignDropDirective<T> = null;
    let type: 'drop' = null;
    do {
      // if (currentElement.classList.contains('cdk-drag') || currentElement.classList.contains('cdk-drop-list')) {
      if (currentElement.classList.contains('cdk-drop-list')) {
        const designDrop: RaDesignDropDirective<T> = (currentElement as any).designDrop;
        if (designDrop.enterPredicate(this.data, drop)) {
          type = 'drop';
          drop = designDrop;
        }
      }
      currentElement = currentElement.parentElement;
    } while (!drop && currentElement);
    if (drop) {
      return {
        type,
        drop
      };
    } else {
      return null;
    }
  }
}

/** Point on the page or within an element. */
interface Point {
  x: number;
  y: number;
}

/**
 * Gets a 3d `transform` that can be applied to an element.
 * @param x Desired position of the element along the X axis.
 * @param y Desired position of the element along the Y axis.
 */
function getTransform(x: number, y: number): string {
  // Round the transforms since some browsers will
  // blur the elements for sub-pixel transforms.
  return `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

/** Creates a deep clone of an element. */
function deepCloneNode(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;
  // Remove the `id` to avoid having multiple elements with the same id on the page.
  clone.removeAttribute('id');
  return clone;
}

/** Clamps a value between a minimum and a maximum. */
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Helper to remove an element from the DOM and to do all the necessary null checks.
 * @param element Element to be removed.
 */
function removeElement(element: HTMLElement | null) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

/** Determines whether an event is a touch event. */
function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return event.type.startsWith('touch');
}
