import {
  isDevMode,
  AfterContentChecked,
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2, Component
} from '@angular/core';
import {IconDirective} from '@ant-design/icons-angular';
import {RaIconService} from './ra-icon.service';

const iconTypeRE = /^anticon\-\w/;

const getIconTypeClass = (className: string): { name: string, index: number } => {
  if (!className) {
    return undefined;
  } else {
    const classArr = className.split(/\s/);
    const index = classArr.findIndex((cls => cls !== 'anticon' && cls !== 'anticon-spin' && !!cls.match(iconTypeRE)));
    return index === -1 ? undefined : {name: classArr[index], index};
  }
};

/**
 * This directive extends IconDirective to provide:
 *
 * - IconFont support
 * - spinning
 * - old API compatibility
 */
@Component({
  selector: 'ra-icon',
  template: '',
})
// @Directive({
//   selector: 'i.anticon, [nz-icon]'
// })
export class RaIconComponent extends IconDirective implements OnInit, OnChanges, OnDestroy, AfterContentChecked {
  @Input() spin = false;
  @Input() iconfont: string;

  private classNameObserver: MutationObserver;
  private el = this.elementRef.nativeElement;

  /**
   * Replacement of `changeIcon` for more modifications.
   * @param oldAPI
   */
  private changeIcon2(oldAPI: boolean = false): void {
    if (!oldAPI) {
      this.setClassName();
    }
    this._changeIcon().then(svg => {
      this.setSVGData(svg);
      if (!oldAPI) {
        this.toggleSpin(svg);
      }
    }).catch((err) => {
      if (err) {
        console.error(err);
        console.warn('[NG-ZORRO]', `You can find more about this error on http://ng.ant.design/components/icon/en`);
      }
    });
  }

  private classChangeHandler(className: string): void {
    const ret = getIconTypeClass(className);
    if (ret) {
      let type = ret.name.replace('anticon-', '');
      if (type.includes('verticle')) {
        type = type.replace('verticle', 'vertical');
        this.iconService.warnAPI('cross');
      }
      if (type.startsWith('cross')) {
        type = type.replace('cross', 'close');
        this.iconService.warnAPI('vertical');
      }
      if (this.type !== type) {
        this.type = type;
        this.changeIcon2(true);
      }
    }
  }

  private toggleSpin(svg: SVGElement): void {
    if ((this.spin || this.type === 'loading') && !this.elementRef.nativeElement.classList.contains('anticon-spin')) {
      this.renderer.addClass(svg, 'anticon-spin');
    } else {
      this.renderer.removeClass(svg, 'anticon-spin');
    }
  }

  private setClassName(): void {
    if (typeof this.type === 'string') {
      const iconClassNameArr = this.el.className.split(/\s/);
      const ret = getIconTypeClass(this.el.className);
      if (ret) {
        iconClassNameArr.splice(ret.index, 1, `anticon-${this.type}`);
        this.renderer.setAttribute(this.el, 'class', iconClassNameArr.join(' '));
      } else {
        this.renderer.addClass(this.el, `anticon-${this.type}`);
      }
    }
  }

  private setSVGData(svg: SVGElement): void {
    if (typeof this.type === 'string') {
      this.renderer.setAttribute(svg, 'data-icon', this.type);
      this.renderer.setAttribute(svg, 'aria-hidden', 'true');
    }
  }

  constructor(public iconService: RaIconService, public elementRef: ElementRef, public renderer: Renderer2) {
    super(iconService, elementRef, renderer);
  }

  ngOnChanges(): void {
    if (!this.iconfont) {
      this.changeIcon2();
    } else {
      this._setSVGElement(this.iconService.createIconfontIcon(`#${this.iconfont}`));
    }
  }

  ngOnInit(): void {
    // If `this.type` is not specified and `classList` contains `anticon`, it should be an icon using old API.
    if (!this.type && this.el.classList.contains('anticon')) {
      this.iconService.warnAPI('old');
      // Get `type` from `className`. If not, initial rendering would be missed.
      this.classChangeHandler(this.el.className);
      // Add `class` mutation observer.
      this.classNameObserver = new MutationObserver((mutations: MutationRecord[]) => {
        mutations
          .filter((mutation: MutationRecord) => mutation.attributeName === 'class')
          .forEach((mutation: MutationRecord) => this.classChangeHandler((mutation.target as HTMLElement).className));
      });
      this.classNameObserver.observe(this.el, {attributes: true});
    }
    // If `classList` does not contain `anticon`, add it before other class names.
    if (!this.el.classList.contains('anticon')) {
      this.renderer.setAttribute(this.el, 'class', `anticon ${this.el.className}`.trim());
    }
  }

  ngOnDestroy(): void {
    if (this.classNameObserver) {
      this.classNameObserver.disconnect();
    }
  }

  /**
   * If custom content is provided, try to normalize SVG elements.
   */
  ngAfterContentChecked(): void {
    const children = this.el.children;
    let length = children.length;
    if (!this.type && children.length) {
      while (length--) {
        const child = children[length];
        if (child.tagName.toLowerCase() === 'svg') {
          this.iconService.normalizeSvgElement(child as SVGElement);
        }
      }
    }
  }
}
