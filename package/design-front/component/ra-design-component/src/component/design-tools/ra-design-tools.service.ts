import {ComponentFactory, ComponentFactoryResolver, Injectable, ViewContainerRef} from '@angular/core';
import {ToolsTabModel} from './interface';
import {RaDesignToolsComponent} from './ra-design-tools.component';
import {DataSourceInterface} from './data-source/data-source.interface';
import {ComponentInterface} from './component/component.interface';
import {PageInterface} from './page/page.interface';
import {IconInterface} from './icon/icon.interface';
import {PropertiesEditorInterface} from './properties-editor/properties-editor.interface';

export enum ToolsFactory {
  DataSource = 'dataSource',
  Page = 'page',
  Component = 'component',
  Icon = 'icon',
  propertiesEditor = 'propertiesEditor',
}

@Injectable()
export class RaDesignToolsService {
  private toolsMap: Map<ToolsFactory, ToolsTabModel> = new Map();
  private toolsList: ToolsTabModel[] = [];
  private factory: Map<String, ComponentFactory<any>> = new Map();
  private RaDesignToolsComponent: RaDesignToolsComponent;
  left: ToolsTabModel[] = [];
  right: ToolsTabModel[] = [];

  constructor(public ComponentFactoryResolver: ComponentFactoryResolver) {
  }

  init(RaDesignToolsComponent: RaDesignToolsComponent) {
    this.RaDesignToolsComponent = RaDesignToolsComponent;
    // 数据源管理
    this.toolsList.push({
      factory: ToolsFactory.DataSource,
      label: 'dataSource',
      position: 'left-top',
      order: 1,
      select: true,
      icon: ''
    });
    this.factory.set(ToolsFactory.DataSource, this.ComponentFactoryResolver.resolveComponentFactory(DataSourceInterface));
    // 页面列表
    this.toolsList.push({
      factory: ToolsFactory.Page,
      label: '页面管理',
      position: 'left-top',
      order: 2,
      select: false,
      icon: 'rabbit-design:icon-page'
    });
    this.factory.set(ToolsFactory.Page, this.ComponentFactoryResolver.resolveComponentFactory(PageInterface));
    // 组件列表
    this.toolsList.push({
      factory: ToolsFactory.Component,
      label: 'component',
      position: 'left-top',
      order: 3,
      select: false,
      icon: 'rabbit-design:icon-component'
    });
    this.factory.set(ToolsFactory.Component, this.ComponentFactoryResolver.resolveComponentFactory(ComponentInterface));
    // 图标
    this.toolsList.push({
      factory: ToolsFactory.Icon,
      label: 'icons',
      position: 'left-bottom',
      order: 4,
      select: false,
      icon: 'rabbit-design:icon-iconfont',
    });
    this.factory.set(ToolsFactory.Icon, this.ComponentFactoryResolver.resolveComponentFactory(IconInterface));

    // 属性面板
    this.toolsList.push({
      factory: ToolsFactory.propertiesEditor,
      label: 'properties',
      position: 'right-top',
      order: 1,
      select: false,
      icon: '',
    });
    this.factory.set(ToolsFactory.propertiesEditor, this.ComponentFactoryResolver.resolveComponentFactory(PropertiesEditorInterface));

    this.toolsList.forEach((tools) => {
      this.toolsMap.set(tools.factory, tools);

      switch (tools.position) {
        case 'left-top':
          this.left.push(tools);
          break;
        case 'left-bottom':
          tools.order += 100;
          this.left.push(tools);
          break;
        case 'right-top':
          this.right.push(tools);
          break;
        case 'right-bottom':
          tools.order += 100;
          this.right.push(tools);
          break;
        default:
          throw new Error('NotPosition');
      }
    });
  }

  showTools(tools: ToolsTabModel) {
    // 获取相同位置的工具栏
    this.toolsList.forEach((_tools) => {
      if (_tools.position === tools.position && _tools !== tools) {
        _tools.select = false;
      }
    });
    tools.select = !tools.select;
    this.RaDesignToolsComponent.showTools();
  }

  getFactory(tools: ToolsFactory) {
    return this.factory.get(tools);
  }

  forEach(call: (tools: ToolsTabModel) => void) {
    this.toolsList.forEach(call);
  }
}
