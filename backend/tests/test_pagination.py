from utils.pagination import filter_by_search, paginate_items


def test_filter_by_search_is_case_insensitive():
    values = ["Alpha", "Beta", "alphabet"]
    assert filter_by_search(values, "ALPH", lambda x: (x,)) == ["Alpha", "alphabet"]


def test_paginate_items_returns_metadata():
    items, metadata = paginate_items([1, 2, 3, 4, 5], page=2, page_size=2)
    assert items == [3, 4]
    assert metadata.total_items == 5
    assert metadata.total_pages == 3
    assert metadata.has_next is True
    assert metadata.has_previous is True

