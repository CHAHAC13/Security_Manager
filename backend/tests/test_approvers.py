from fastapi.testclient import TestClient

from main import app


def test_technical_approvers_returns_default_members():
    with TestClient(app) as client:
        response = client.get("/api/v1/approvers/technical")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 4
    assert body["source"] == "mock"
    emails = [item["email"] for item in body["items"]]
    assert emails == [
        "Suresh.Subramanian@pfizer.com",
        "lori.m.ross@pfizer.com",
        "Jisun.Yoon@Pfizer.com",
        "Marty.Hall@Pfizer.com",
    ]
    assert body["items"][0]["display_name"] == "Subramanian, Suresh"
    assert all(item["approver_type"] == "TECHNICAL" for item in body["items"])


def test_business_approvers_lists_directory_paginated():
    with TestClient(app) as client:
        response = client.get("/api/v1/approvers/business", params={"page_size": 5})
    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 5
    assert body["pagination"]["total_items"] == 15
    assert body["pagination"]["total_pages"] == 3
    assert body["pagination"]["has_next"] is True
    assert body["search"] is None
    names = [item["display_name"] for item in body["items"]]
    assert names == sorted(names, key=str.casefold)


def test_business_approvers_search_by_name_email_and_department():
    with TestClient(app) as client:
        by_first_last = client.get("/api/v1/approvers/business", params={"search": "grace kim"}).json()
        by_display = client.get("/api/v1/approvers/business", params={"search": "Kim, Grace"}).json()
        by_email = client.get("/api/v1/approvers/business", params={"search": "BRIAN.CHEN@"}).json()
        by_dept = client.get("/api/v1/approvers/business", params={"search": " clinical operations "}).json()
        no_match = client.get("/api/v1/approvers/business", params={"search": "zzz-nobody"}).json()
    assert [i["email"] for i in by_first_last["items"]] == ["Grace.Kim@pfizer.com"]
    assert [i["email"] for i in by_display["items"]] == ["Grace.Kim@pfizer.com"]
    assert [i["email"] for i in by_email["items"]] == ["Brian.Chen@pfizer.com"]
    assert {i["email"] for i in by_dept["items"]} == {"Anna.Martinez@pfizer.com", "Isabel.Garcia@pfizer.com"}
    assert by_dept["search"] == "clinical operations"
    assert no_match["items"] == []
    assert no_match["pagination"]["total_items"] == 0


def test_business_approvers_validates_query_params():
    with TestClient(app) as client:
        assert client.get("/api/v1/approvers/business", params={"page": 0}).status_code == 422
        assert client.get("/api/v1/approvers/business", params={"page_size": 101}).status_code == 422
        assert client.get("/api/v1/approvers/business", params={"search": "x" * 201}).status_code == 422
