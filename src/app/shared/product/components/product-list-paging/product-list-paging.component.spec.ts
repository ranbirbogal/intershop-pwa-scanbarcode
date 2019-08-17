import { ComponentFixture, TestBed, async } from '@angular/core/testing';

import { ProductListPagingComponent } from './product-list-paging.component';

describe('Product List Paging Component', () => {
  let component: ProductListPagingComponent;
  let fixture: ComponentFixture<ProductListPagingComponent>;
  let element: HTMLElement;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ProductListPagingComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ProductListPagingComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    component.pageIndices = [1, 2, 3];
    component.pageUrl = '/some/followup/link';
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
    expect(element).toBeTruthy();
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('should render adequately for starting page', () => {
    component.currentPage = 1;
    fixture.detectChanges();

    expect(element).toMatchInlineSnapshot(`
      <div class="product-list-paging">
        <a class="active" href="/some/followup/link?page=1">1</a><a href="/some/followup/link?page=2">2</a
        ><a href="/some/followup/link?page=3">3</a><a href="/some/followup/link?page=2">»</a>
      </div>
    `);
  });

  it('should render adequately for middle page', () => {
    component.currentPage = 2;
    fixture.detectChanges();

    expect(element).toMatchInlineSnapshot(`
      <div class="product-list-paging">
        <a href="/some/followup/link?page=1">«</a><a href="/some/followup/link?page=1">1</a
        ><a class="active" href="/some/followup/link?page=2">2</a
        ><a href="/some/followup/link?page=3">3</a><a href="/some/followup/link?page=3">»</a>
      </div>
    `);
  });

  it('should render adequately for last page', () => {
    component.currentPage = 3;
    fixture.detectChanges();

    expect(element).toMatchInlineSnapshot(`
      <div class="product-list-paging">
        <a href="/some/followup/link?page=2">«</a><a href="/some/followup/link?page=1">1</a
        ><a href="/some/followup/link?page=2">2</a
        ><a class="active" href="/some/followup/link?page=3">3</a>
      </div>
    `);
  });
});
