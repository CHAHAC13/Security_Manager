import math
from collections.abc import Callable, Sequence
from typing import TypeVar

from schemas.blueprint_models import PaginationMetadata

T = TypeVar("T")


def filter_by_search(
    items: Sequence[T],
    search: str | None,
    search_fields: Callable[[T], Sequence[str | None]],
) -> list[T]:
    if not search or not search.strip():
        return list(items)

    needle = search.strip().casefold()
    return [
        item
        for item in items
        if any(
            needle in value.casefold()
            for value in search_fields(item)
            if value is not None
        )
    ]


def paginate_items(
    items: Sequence[T],
    page: int,
    page_size: int,
) -> tuple[list[T], PaginationMetadata]:
    total_items = len(items)
    total_pages = math.ceil(total_items / page_size) if total_items else 0
    start_index = (page - 1) * page_size
    page_items = list(items[start_index : start_index + page_size])

    metadata = PaginationMetadata(
        page=page,
        page_size=page_size,
        total_items=total_items,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_previous=page > 1 and total_pages > 0,
    )
    return page_items, metadata