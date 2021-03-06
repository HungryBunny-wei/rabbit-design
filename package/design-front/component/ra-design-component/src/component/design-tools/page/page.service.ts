import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {DesignMenuModel} from '../../design-menu/interface';
import {map} from 'rxjs/operators';
import {PageModel, PageType, QueryToolsPageTreeDto, QueryToolsPageTreeNodeDto, Result} from './interface';
import {Observable} from 'rxjs';
import {RaDesignTreeService, TreeNodeModel} from '../../design-tree';

export const PageContextMenuKey = {
  New: {
    Page: 'Page',
    Dir: 'Dir',
    Router2Dir: 'Router2Dir',
    ComponentDir: 'ComponentDir',
  },
  Copy: 'Copy',
  Cut: 'Cut',
  Delete: 'Delete',
};
export const PageContextMenu: {
  [index: string]: DesignMenuModel;
} = {
  Page: {
    label: 'Page',
    icon: 'rabbit-design:icon-page',
    key: PageContextMenuKey.New.Page
  },
  Dir: {
    label: 'Dir',
    icon: 'rabbit-design:icon-folder',
    key: PageContextMenuKey.New.Dir
  },
  Router2Dir: {
    label: 'Router 2level Dir',
    icon: 'rabbit-design:icon-router',
    key: PageContextMenuKey.New.Router2Dir
  },
  ComponentDir: {
    label: 'Components Dir',
    icon: 'rabbit-design:icon-component',
    key: PageContextMenuKey.New.ComponentDir
  },
  Copy: {
    label: 'Copy',
    icon: 'rabbit-design:icon-copy',
    shortcut: 'Ctrl+c',
    key: PageContextMenuKey.Copy
  },
  Cut: {
    label: 'Copy',
    icon: 'rabbit-design:icon-cut',
    shortcut: 'Ctrl+c',
    key: PageContextMenuKey.Cut
  },
  Delete: {
    label: 'Delete',
    icon: 'rabbit-design:icon-delete',
    shortcut: 'Delete',
    key: PageContextMenuKey.Delete
  },
};

@Injectable({providedIn: 'root'})
export class PageService {
  constructor(public HttpClient: HttpClient) {
    this.init();
  }

  init() {
  }

  /**
   * Http api
   */
  index(): Observable<QueryToolsPageTreeDto[]> {
    return this.HttpClient.get('api/tools-page', {}).pipe(map((result: Result<QueryToolsPageTreeDto[]>) => {
      RaDesignTreeService.forEachTree(result.data, (node) => {
        if (node.children) {
          node.children.sort(this.sort);
        }
      });
      return result.data;
    }));
  }

  add(page: PageModel): Observable<QueryToolsPageTreeNodeDto> {
    return this.HttpClient.post('api/tools-page', page).pipe(map((result: Result<QueryToolsPageTreeNodeDto>) => {
      return result.data;
    }));
  }

  delete(pageID: string): Observable<void> {
    return this.HttpClient.delete('api/tools-page', {params: {pageID: pageID}}).pipe(map((result: Result<void>) => {
      return result.data;
    }));
  }

  getContextMenu(page: PageModel): DesignMenuModel[] {
    switch (page.pageType) {
      case PageType.page:
        return [
          PageContextMenu.Copy,
          PageContextMenu.Cut,
          PageContextMenu.Delete,
        ];
      case PageType.dir:
        return [
          {
            label: 'New',
            items: [
              PageContextMenu.Page,
              PageContextMenu.Dir,
            ]
          },
          PageContextMenu.Copy,
          PageContextMenu.Cut,
          PageContextMenu.Delete,
        ];
      case PageType.router2:
        return [
          {
            label: 'New',
            items: [
              PageContextMenu.Page,
              PageContextMenu.Dir,
            ]
          },
          PageContextMenu.Copy,
          PageContextMenu.Cut,
          PageContextMenu.Delete,
        ];
      case PageType.component:
        return [
          {
            label: 'New',
            items: [
              PageContextMenu.Page,
              PageContextMenu.Dir,
            ]
          },
          PageContextMenu.Delete,
        ];
      default:
        return [
          {
            label: 'New',
            items: [
              PageContextMenu.Page,
              PageContextMenu.Dir,
              PageContextMenu.Router2Dir,
              PageContextMenu.ComponentDir,
            ]
          },
          PageContextMenu.Copy,
          PageContextMenu.Cut,
          PageContextMenu.Delete,
        ];
    }
  }

  sort(item1: TreeNodeModel, item2: TreeNodeModel): number;
  sort(item1: PageModel, item2: PageModel): number;
  sort(item1: any, item2: any): number {
    const item1PageType: PageType = item1.pageType ? item1.pageType : item1.origin.pageType;
    const item2PageType: PageType = item2.pageType ? item2.pageType : item2.origin.pageType;
    const item1PageName: PageType = item1.pageName ? item1.pageName : item1.origin.pageName;
    const item2PageName: PageType = item2.pageName ? item2.pageName : item2.origin.pageName;

    if (item1PageType === item2PageType) { // 如果一样就对比名称
      return item1PageName > item2PageName ? 1 : -1;
    }
    if (item1PageType === PageType.component) {
      return -1;
    }
    if (item1PageType === PageType.router2) {
      return item2PageType === PageType.component ? 1 : -1;
    }
    if (item1PageType === PageType.dir) {
      return item2PageType === PageType.page ? -1 : 1;
    }
    if (item1PageType === PageType.page) {
      return item2PageType === PageType.page ? 0 : 1;
    }
  }
}
