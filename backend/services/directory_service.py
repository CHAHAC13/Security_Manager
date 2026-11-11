"""Directory lookups for the Approvers tab.

Technical approvers will come from a dedicated group (not created yet) and
business approvers from the Pfizer Active Directory (no access yet). Until then
`MockDirectoryProvider` serves static mock data. To integrate the real sources,
implement `DirectoryProvider` (e.g. Microsoft Graph / LDAP client) and return it
from `get_directory_provider` - the router and response models stay unchanged.
"""

from typing import Protocol

from schemas.approver_models import ApproverResponse
from utils.pagination import filter_by_search


class DirectoryProvider(Protocol):
    source: str

    async def list_technical_approvers(self) -> list[ApproverResponse]: ...

    async def search_business_users(self, search: str | None) -> list[ApproverResponse]: ...


def _person(
    id: str,
    first_name: str,
    last_name: str,
    email: str,
    approver_type: str,
    job_title: str | None = None,
    department: str | None = None,
) -> ApproverResponse:
    # AD display name format: "Last, First".
    return ApproverResponse(
        id=id,
        display_name=f"{last_name}, {first_name}",
        first_name=first_name,
        last_name=last_name,
        email=email,
        job_title=job_title,
        department=department,
        approver_type=approver_type,
    )


# Default technical approvers (mock until the approvers group is created).
MOCK_TECHNICAL_APPROVERS: list[ApproverResponse] = [
    _person("tech-001", "Suresh", "Subramanian", "Suresh.Subramanian@pfizer.com", "TECHNICAL"),
    _person("tech-002", "Lori M", "Ross", "lori.m.ross@pfizer.com", "TECHNICAL"),
    _person("tech-003", "Jisun", "Yoon", "Jisun.Yoon@Pfizer.com", "TECHNICAL"),
    _person("tech-004", "Marty", "Hall", "Marty.Hall@Pfizer.com", "TECHNICAL"),
]

# Mock Pfizer Active Directory users (fictitious; replace with AD integration).
MOCK_BUSINESS_DIRECTORY: list[ApproverResponse] = [
    _person("ad-0001", "Anna", "Martinez", "Anna.Martinez@pfizer.com", "BUSINESS", "Director, Clinical Operations", "Clinical Operations"),
    _person("ad-0002", "Brian", "Chen", "Brian.Chen@pfizer.com", "BUSINESS", "Senior Manager, Data Governance", "Data Governance"),
    _person("ad-0003", "Catherine", "Patel", "Catherine.Patel@pfizer.com", "BUSINESS", "Associate Director, Regulatory Affairs", "Regulatory Affairs"),
    _person("ad-0004", "David", "Johnson", "David.Johnson@pfizer.com", "BUSINESS", "Head of Commercial Analytics", "Commercial Analytics"),
    _person("ad-0005", "Elena", "Rossi", "Elena.Rossi@pfizer.com", "BUSINESS", "Manager, Pharmacovigilance", "Drug Safety"),
    _person("ad-0006", "Farhan", "Khan", "Farhan.Khan@pfizer.com", "BUSINESS", "Director, Medical Affairs", "Medical Affairs"),
    _person("ad-0007", "Grace", "Kim", "Grace.Kim@pfizer.com", "BUSINESS", "Senior Director, R&D Data Strategy", "Research & Development"),
    _person("ad-0008", "Henry", "Williams", "Henry.Williams@pfizer.com", "BUSINESS", "Manager, Supply Chain Analytics", "Global Supply"),
    _person("ad-0009", "Isabel", "Garcia", "Isabel.Garcia@pfizer.com", "BUSINESS", "Associate Director, Clinical Data Management", "Clinical Operations"),
    _person("ad-0010", "James", "Thompson", "James.Thompson@pfizer.com", "BUSINESS", "Director, Finance Business Partner", "Finance"),
    _person("ad-0011", "Kavya", "Iyer", "Kavya.Iyer@pfizer.com", "BUSINESS", "Senior Manager, Real World Evidence", "Medical Affairs"),
    _person("ad-0012", "Liam", "O'Connor", "Liam.OConnor@pfizer.com", "BUSINESS", "Manager, Quality Assurance", "Quality"),
    _person("ad-0013", "Maria", "Lopez", "Maria.Lopez@pfizer.com", "BUSINESS", "Director, Patient Services", "Commercial"),
    _person("ad-0014", "Nikhil", "Sharma", "Nikhil.Sharma@pfizer.com", "BUSINESS", "Associate Director, Biostatistics", "Research & Development"),
    _person("ad-0015", "Olivia", "Brown", "Olivia.Brown@pfizer.com", "BUSINESS", "Senior Manager, Privacy Office", "Legal & Compliance"),
]


def _search_fields(person: ApproverResponse) -> list[str | None]:
    full_name = f"{person.first_name or ''} {person.last_name or ''}".strip()
    return [
        person.display_name,
        full_name,
        person.email,
        person.job_title,
        person.department,
    ]


class MockDirectoryProvider:
    source = "mock"

    async def list_technical_approvers(self) -> list[ApproverResponse]:
        return list(MOCK_TECHNICAL_APPROVERS)

    async def search_business_users(self, search: str | None) -> list[ApproverResponse]:
        matches = filter_by_search(MOCK_BUSINESS_DIRECTORY, search, _search_fields)
        return sorted(matches, key=lambda person: person.display_name.casefold())


def get_directory_provider() -> DirectoryProvider:
    # Swap for the real group / Active Directory provider once access is granted.
    return MockDirectoryProvider()
