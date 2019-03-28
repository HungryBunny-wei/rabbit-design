import {
  AfterViewInit,
  Component, OnChanges, OnDestroy,
  OnInit, SimpleChanges,
} from '@angular/core';
import {PageEditorService} from './page-editor.service';
import {DesignHtmlJson, PageInfoModel} from './interface';
import {HtmlJson, parse, stringify} from 'himalaya';
import {RaDesignKeyMapService} from '../../design-key-map/ra-design-key-map.service';

@Component({
  selector: 'ra-design-page-editor',
  template: `
    <div class="page-editor" style="">
      <div class="page-editor__form" designDrop="page-editor" [designData]="stageID">
        <ng-template [design-dynamic]="dynamicHtml"></ng-template>
      </div>
      <div class="editor-stage-footer">
      </div>
    </div>
  `,
  styles: []
})
export class PageEditorInterface implements OnInit, AfterViewInit, OnDestroy, OnChanges {
  pageInfo: PageInfoModel;
  stageID: string;
  private dynamicHtml: string;

  constructor(
    public PageEditorService: PageEditorService,
    public RaDesignKeyMapService: RaDesignKeyMapService,
  ) {
  }

  ngOnInit() {
    this.PageEditorService.findOne(this.stageID).subscribe((pageInfo) => {
      this.pageInfo = pageInfo;
      this.PageEditorService.addRoot(this.stageID, pageInfo.content || '');
    });
  }
  ngAfterViewInit() {
    this.PageEditorService.subscribe(this.stageID, (event) => {
      switch (event.type) {
        case 'update-dynamic-html':
          this.dynamicHtml = event.data;
          this.pageInfo.content = stringify(this.PageEditorService.getHtmlJson(this.stageID));
          this.PageEditorService.modify(this.pageInfo).subscribe(() => {
          });
          break;
      }
    });
  }

  addChildren(path) {

  }


  ngOnChanges(simple: SimpleChanges) {
    console.log(simple);
  }

  ngOnDestroy() {
    this.PageEditorService.modify(this.pageInfo).subscribe(() => {
    });
    this.PageEditorService.deleteHtmlJson(this.stageID);
  }
}
