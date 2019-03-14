import {Component} from '@angular/core';
import {RaDesignStageService, StageFactory} from '../../design-stage';
import {NzFormatEmitEvent} from '../../design-tree';

@Component({
  template: `
    <div class="ra-design-tools-title">
      <i class="fa fa-first-order"></i>
      <label>页面管理</label>
    </div>
    <ra-design-tree [nzData]="data" (nzDblClick)="onDblclick($event)" [cdkDrag]="true"></ra-design-tree>
  `,
  styles: []
})
export class PageInterface {
  data: any[] = [
    {
      key: 4,
      title: '设置管理',
      id: '4',
      children:[
        {
          key: 5,
          title: '首页超长文字首页超长文字首页超长文字首页超长文字',
          id: '5',
          leaf: false,
          children:[
            {
              key: 7,
              title: '首页',
              id: '7',
              leaf: false,
            },
            {
              key: 8,
              title: '登录',
              id: '8',
              leaf: false,
            },
          ]
        },
        {
          key: 6,
          title: '登录',
          id: '6',
          leaf: false,
        },
      ]
    },
    {
      key: 1,
      title: '首页',
      id: '1',
      leaf: false,
    },
    {
      key: 2,
      title: '登录',
      id: '2',
      leaf: false,
    },
    {
      key: 3,
      title: '设置超长文字设置超长文字设置超长文字设置超长文字设置超长文字',
      id: '3',
      leaf: false,
    },
  ];

  constructor(public RaDesignStageService: RaDesignStageService) {
  }

  onDblclick($event: NzFormatEmitEvent) {
    console.log($event.node);
    const node = $event.node;
    this.RaDesignStageService.putStage(StageFactory.PageEditor, {id: node.key, title: node.title});
  }

}
